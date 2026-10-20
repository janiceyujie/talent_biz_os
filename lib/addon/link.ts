import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { authAccount, gmailAddonLink, gmailAddonLinkRequest, membership, person, talent } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { toLocale } from "@/lib/i18n/config";

// Linking a Gmail account to a person for the add-on (docs/design/gmail-addon.md,
// Linking). Either the account already signs this person in with Google, or
// two halves: our site (signed in, confirms) and then the card (only that Gmail
// account can confirm there). Tokens are stored as their SHA-256 only.

const REQUEST_MINUTES = 10;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type Linked = { linkId: string; personId: string; personEmail: string; locale: string; lastTalentId: string | null };

/** The person this Gmail account is linked to; refreshes its address and last use. */
export async function linkedPerson(sub: string, email: string): Promise<Linked | null> {
  const [row] = await db
    .select({ linkId: gmailAddonLink.id, personId: person.id, personEmail: person.email, locale: person.locale, lastTalentId: gmailAddonLink.lastTalentId, googleEmail: gmailAddonLink.googleEmail })
    .from(gmailAddonLink)
    .innerJoin(person, eq(person.id, gmailAddonLink.personId))
    .where(eq(gmailAddonLink.googleSubject, sub));
  if (!row) return null;
  await db
    .update(gmailAddonLink)
    .set({ lastUsedAt: new Date(), ...(row.googleEmail !== email ? { googleEmail: email } : {}) })
    .where(eq(gmailAddonLink.id, row.linkId));
  return row;
}

/** A person who signs in with this same Google account is already proven: link it at once (decision 0001). */
export async function linkBySignIn(sub: string, email: string): Promise<boolean> {
  const [account] = await db
    .select({ personId: authAccount.personId })
    .from(authAccount)
    .where(and(eq(authAccount.providerId, "google"), eq(authAccount.accountId, sub)));
  if (!account) return false;
  await saveLink(account.personId, sub, email);
  return true;
}

/** A new request: the token goes in the Connect link, once. Expired ones are cleared on the way. */
export async function startRequest(sub: string, email: string): Promise<string> {
  await db.delete(gmailAddonLinkRequest).where(lt(gmailAddonLinkRequest.expiresAt, new Date()));
  const token = randomBytes(32).toString("base64url");
  await db.insert(gmailAddonLinkRequest).values({ tokenHash: hash(token), googleSubject: sub, googleEmail: email, expiresAt: new Date(Date.now() + REQUEST_MINUTES * 60_000) });
  return token;
}

/** A request someone confirmed on our site, waiting for this Gmail account to confirm in the card. */
export async function confirmedRequest(sub: string) {
  const [row] = await db
    .select({ personId: person.id, personEmail: person.email, googleEmail: gmailAddonLinkRequest.googleEmail })
    .from(gmailAddonLinkRequest)
    .innerJoin(person, eq(person.id, gmailAddonLinkRequest.personId))
    .where(and(eq(gmailAddonLinkRequest.googleSubject, sub), isNotNull(gmailAddonLinkRequest.personId), gt(gmailAddonLinkRequest.expiresAt, new Date())))
    .orderBy(asc(gmailAddonLinkRequest.createdAt))
    .limit(1);
  return row ?? null;
}

/** The card's confirmation: the link is made (replacing any other person's), and the requests go. */
export async function finishRequest(sub: string): Promise<boolean> {
  const request = await confirmedRequest(sub);
  if (!request) return false;
  await saveLink(request.personId, sub, request.googleEmail);
  return true;
}

/** Cancel in the card, or Change account: this account's requests and link go. */
export async function forget(sub: string) {
  await db.transaction(async (tx) => {
    await tx.delete(gmailAddonLinkRequest).where(eq(gmailAddonLinkRequest.googleSubject, sub));
    await tx.delete(gmailAddonLink).where(eq(gmailAddonLink.googleSubject, sub));
  });
}

/** Our site's half: the request behind a Connect link, while it's still good. */
export async function requestFor(token: string) {
  const [row] = await db
    .select()
    .from(gmailAddonLinkRequest)
    .where(and(eq(gmailAddonLinkRequest.tokenHash, hash(token)), gt(gmailAddonLinkRequest.expiresAt, new Date())));
  return row ?? null;
}

/** Our site's half, confirmed by the signed-in person: only a request nobody else has claimed. */
export async function claimRequest(token: string, personId: string): Promise<boolean> {
  const claimed = await db
    .update(gmailAddonLinkRequest)
    .set({ personId })
    .where(and(eq(gmailAddonLinkRequest.tokenHash, hash(token)), gt(gmailAddonLinkRequest.expiresAt, new Date())))
    .returning({ personId: gmailAddonLinkRequest.personId });
  return claimed.length === 1;
}

/** The artists a person can send to: every active membership, by name. */
export async function artistsOf(personId: string) {
  return db
    .select({ id: talent.id, name: talent.name })
    .from(membership)
    .innerJoin(talent, eq(talent.id, membership.talentId))
    .where(and(eq(membership.personId, personId), eq(membership.status, "active")))
    .orderBy(asc(talent.name), asc(talent.id));
}

/** Made or replaced; the person is told by email, so a link they didn't make doesn't go unseen. */
async function saveLink(personId: string, sub: string, email: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(gmailAddonLink)
      .values({ personId, googleSubject: sub, googleEmail: email, lastUsedAt: new Date() })
      .onConflictDoUpdate({ target: gmailAddonLink.googleSubject, set: { personId, googleEmail: email, lastTalentId: null, lastUsedAt: new Date(), createdAt: new Date() } });
    await tx.delete(gmailAddonLinkRequest).where(eq(gmailAddonLinkRequest.googleSubject, sub));
  });
  const [to] = await db.select({ email: person.email, locale: person.locale }).from(person).where(eq(person.id, personId));
  if (!to) return;
  const t = await getTranslations({ locale: toLocale(to.locale), namespace: "emails" });
  await sendEmail({ to: to.email, subject: t("addonLinkedSubject"), text: t("addonLinkedBody", { gmail: email }) }).catch((e) =>
    console.error("addon link email failed", (e as Error)?.name),
  );
}
