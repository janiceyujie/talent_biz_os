import { eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { cards, FIELD, replace, show, type Card } from "@/lib/addon/cards";
import { parseEvent, type AddonEvent } from "@/lib/addon/event";
import { artistsOf, confirmedRequest, finishRequest, forget, linkBySignIn, linkedPerson, startRequest, type Linked } from "@/lib/addon/link";
import { addonAvailable, addonEndpoint, identify } from "@/lib/addon/request";
import { openProjects, sendThread, threadInfo, toSend } from "@/lib/addon/thread";
import { db } from "@/lib/db";
import { gmailAddonLink, project } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { gmailAddonReader } from "@/lib/mail/gmail";
import type { ReadMessage } from "@/lib/mail/gmail/parts";

// The Gmail add-on's one endpoint (docs/design/gmail-addon.md): Google posts here
// when the card opens (homepage, or an email opened) and on every button, and
// draws the card we answer with. Every request is checked to be Google's first.

/** The card's text in a language; the cards take keys as plain strings. */
async function text(locale: unknown) {
  const t = await getTranslations({ locale: toLocale(locale), namespace: "addon" });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
}

const base = () => (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
const respond = (body: unknown) => NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });

export async function POST(req: NextRequest) {
  if (!addonAvailable()) return new NextResponse(null, { status: 404 });
  const event = parseEvent(await req.json().catch(() => null));
  if (!event) return new NextResponse(null, { status: 400 });
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const who = await identify(bearer || event.systemIdToken, event.userIdToken);
  if (!who) return new NextResponse(null, { status: 401 });
  const wrap = event.action ? replace : show;
  try {
    return respond(wrap(await cardFor(event, who)));
  } catch (e) {
    // Ids and codes only: never the email.
    console.error("addon request failed", event.action ?? "open", (e as Error)?.name, (e as { status?: number })?.status ?? "");
    const t = await text(undefined);
    return respond(wrap(cards(t, addonEndpoint()).problem(t("failed"))));
  }
}

async function cardFor(event: AddonEvent, who: { sub: string; email: string }): Promise<Card> {
  if (event.action === "cancelLink" || event.action === "unlink") await forget(who.sub);
  if (event.action === "confirmLink") await finishRequest(who.sub);

  let linked = await linkedPerson(who.sub, who.email);
  if (!linked && event.action !== "unlink" && (await linkBySignIn(who.sub, who.email))) linked = await linkedPerson(who.sub, who.email);
  if (!linked) {
    const t = await text(undefined);
    const c = cards(t, addonEndpoint());
    const pending = await confirmedRequest(who.sub);
    if (pending) return c.confirmLink(who.email, pending.personEmail);
    const token = await startRequest(who.sub, who.email);
    return c.connect(`${base()}/addon/link?${new URLSearchParams({ token })}`);
  }

  const t = await text(linked.locale);
  const c = cards(t, addonEndpoint());
  const artists = await artistsOf(linked.personId);
  if (!artists.length) return c.setup(linked.personEmail, `${base()}/onboarding`);
  if (!event.email) return c.home(linked.personEmail, `${base()}/inbox`);

  const reader = gmailAddonReader(event.userToken, event.email.accessToken);
  const threadId = event.email.threadId ?? (await reader.threadOf(event.email.messageId));
  const picked = event.field(FIELD.artist);
  const artistId = (artists.find((a) => a.id === picked) ?? artists.find((a) => a.id === linked.lastTalentId) ?? artists[0]).id;

  if (event.action === "send") {
    const projectId = event.field(FIELD.project) || null;
    if (projectId && !(await openProjects(artistId)).some((p) => p.id === projectId)) return c.problem(t("projectGone"));
    const result = await sendThread({ reader, sub: who.sub, personId: linked.personId, locale: linked.locale, talentId: artistId, projectId, threadId, openedId: event.email.messageId });
    await remember(linked, artistId);
    if (result.kind === "sent") {
      const title = projectId ? ((await openProjects(artistId)).find((p) => p.id === projectId)?.title ?? null) : null;
      return c.sent({ count: result.ids.length, project: title, openUrl: inboxUrl(result.ids[result.ids.length - 1]), person: linked.personEmail });
    }
  }
  return threadCard(c, { linked, artists, artistId, sub: who.sub, mail: await reader.threadHeads(threadId), openedId: event.email.messageId });
}

const inboxUrl = (messageId: string) => `${base()}/inbox?${new URLSearchParams({ message: messageId })}`;

async function remember(linked: Linked, talentId: string) {
  if (linked.lastTalentId !== talentId) await db.update(gmailAddonLink).set({ lastTalentId: talentId }).where(eq(gmailAddonLink.id, linked.linkId));
}

/** Where the thread's emails are, in any of the person's artists, and the form for the artist picked. */
async function threadCard(
  c: ReturnType<typeof cards>,
  v: { linked: Linked; artists: { id: string; name: string }[]; artistId: string; sub: string; mail: ReadMessage[]; openedId: string },
) {
  const info = await threadInfo(v.artists.map((a) => a.id), v.sub, v.mail.map((m) => m.id));
  const filedIds = [...new Set(info.flatMap((m) => (m.projectId ? [m.projectId] : [])))];
  const titles = filedIds.length ? await db.select({ id: project.id, title: project.title }).from(project).where(inArray(project.id, filedIds)) : [];
  const newest = [...info].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
  const here = info.filter((m) => m.talentId === v.artistId);
  const plan = await toSend({ talentId: v.artistId, sub: v.sub, mail: v.mail, openedId: v.openedId });
  const fresh = plan.kind === "fresh" ? plan.fresh.length : 0;
  const projects = fresh ? await openProjects(v.artistId) : [];
  // The project already picked or filed for this thread, if still open.
  const prior = here.map((m) => m.projectId ?? m.chosenProjectId).find((id) => id && projects.some((p) => p.id === id)) ?? "";
  return c.thread({
    person: v.linked.personEmail,
    total: v.mail.length,
    waiting: info.filter((m) => !m.projectId && m.status !== "dismissed").length,
    dismissed: info.filter((m) => m.status === "dismissed").length,
    filed: titles.map((p) => p.title),
    openUrl: newest ? inboxUrl(newest.id) : null,
    form: fresh > 0 ? { fresh, artists: v.artists, artistId: v.artistId, projects, projectId: prior } : null,
    notice: plan.kind === "notice",
  });
}
