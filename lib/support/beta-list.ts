import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { person, signupAllowlist } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { localeNames, toLocale, type Locale } from "@/lib/i18n/config";
import { log } from "@/lib/log";
import { canInvite, parseBatch, sortBatch, statusOf } from "./beta";

// The Support page's beta list (decision 0028): who may sign up during the
// beta, and their invitations. Support staff read it; only admins add, invite,
// and withdraw, since each is hard to take back (a stranger signing up, an email
// sent). Each change records who made it on the row.

const addedBy = alias(person, "added_by_person");
const sentBy = alias(person, "sent_by_person");
const withdrawnBy = alias(person, "withdrawn_by_person");

/** Every place on the list, newest first, with its status and who did what. */
export async function betaList() {
  await requireStaff();
  const rows = await db
    .select({
      id: signupAllowlist.id,
      email: signupAllowlist.email,
      name: signupAllowlist.name,
      note: signupAllowlist.note,
      locale: signupAllowlist.locale,
      createdAt: signupAllowlist.createdAt,
      addedBy: addedBy.displayName,
      invitationSentAt: signupAllowlist.invitationSentAt,
      invitationSentBy: sentBy.displayName,
      usedAt: signupAllowlist.usedAt,
      withdrawnAt: signupAllowlist.withdrawnAt,
      withdrawnBy: withdrawnBy.displayName,
    })
    .from(signupAllowlist)
    .leftJoin(addedBy, eq(addedBy.id, signupAllowlist.addedBy))
    .leftJoin(sentBy, eq(sentBy.id, signupAllowlist.invitationSentBy))
    .leftJoin(withdrawnBy, eq(withdrawnBy.id, signupAllowlist.withdrawnBy))
    .orderBy(desc(signupAllowlist.createdAt));
  return rows.map((r) => ({ ...r, status: statusOf(r) }));
}

/** A pasted batch, sorted against the list and accounts: what adding it would do. Nothing is written. */
export async function previewBatch(pasted: string) {
  await requireStaff("admin");
  const { people, invalid } = parseBatch(pasted);
  const names = Object.fromEntries(people.map((p) => [p.email, p.name]));
  return { ...(await sortAgainstList(people.map((p) => p.email))), names, invalid };
}

async function sortAgainstList(emails: string[]) {
  if (!emails.length) return sortBatch([], [], []);
  const [listed, accounts] = await Promise.all([
    db.select({ email: signupAllowlist.email, withdrawnAt: signupAllowlist.withdrawnAt }).from(signupAllowlist).where(inArray(signupAllowlist.email, emails)),
    db.select({ email: person.email }).from(person).where(inArray(person.email, emails)),
  ]);
  return sortBatch(
    emails,
    listed,
    accounts.map((a) => a.email),
  );
}

/**
 * Adds a batch: new places, and withdrawn ones restored with this batch's note
 * and language. Sorted again here, not taken from the preview: the list may have
 * changed since. Returns how many of each.
 */
export async function addBatch(input: { pasted: string; note: string; locale: Locale }) {
  const admin = await requireStaff("admin");
  const { people } = parseBatch(input.pasted);
  const nameOf = new Map(people.map((p) => [p.email, p.name]));
  const batch = await sortAgainstList(people.map((p) => p.email));
  const note = input.note.trim().slice(0, 200) || null;
  await db.transaction(async (tx) => {
    if (batch.add.length)
      await tx
        .insert(signupAllowlist)
        .values(batch.add.map((email) => ({ email, name: nameOf.get(email) ?? null, note, locale: input.locale, addedBy: admin.personId })))
        .onConflictDoNothing({ target: signupAllowlist.email });
    for (const email of batch.restore)
      await tx
        .update(signupAllowlist)
        .set({ withdrawnAt: null, withdrawnBy: null, note, locale: input.locale, addedBy: admin.personId, createdAt: sql`now()`, ...(nameOf.get(email) && { name: nameOf.get(email) }) })
        .where(and(eq(signupAllowlist.email, email), isNotNull(signupAllowlist.withdrawnAt)));
  });
  log.info("beta.list.added", { person_id: admin.personId, count: batch.add.length + batch.restore.length });
  return { added: batch.add.length, restored: batch.restore.length, skipped: batch.listed.length + batch.hasAccount.length };
}

/** The address an invitation's sign-up link points to. */
const signUpUrl = () => new URL("/sign-up", process.env.BETTER_AUTH_URL).toString();

/** An invitation in a language, for one person: the email itself, as sent and as previewed. */
async function invitation(locale: Locale, place: { email: string; name: string | null }) {
  const t = await getTranslations({ locale, namespace: "emails" });
  const greeting = place.name ? t("inviteGreeting", { name: place.name }) : t("inviteGreetingNoName");
  return { subject: t("inviteSubject"), text: `${greeting}\n\n${t("inviteBody", { url: signUpUrl(), email: place.email })}` };
}

/**
 * What sending to these places would do: each recipient (and whether they were
 * sent one before), and each language's email as its first recipient will get
 * it. Every email is written for its own recipient: their name and address.
 */
export async function previewInvitations(ids: string[]) {
  await requireStaff("admin");
  const places = await placesToInvite(ids);
  const locales = [...new Set(places.map((p) => toLocale(p.locale)))];
  return {
    count: places.length,
    sentBefore: places.filter((p) => p.invitationSentAt).length,
    recipients: places.map((p) => ({ email: p.email, name: p.name, language: localeNames[toLocale(p.locale)], sentBefore: Boolean(p.invitationSentAt) })),
    emails: await Promise.all(
      locales.map(async (locale) => {
        const first = places.find((p) => p.locale === locale)!;
        return { locale, language: localeNames[locale], sample: first.name ?? first.email, ...(await invitation(locale, first)) };
      }),
    ),
  };
}

const placesToInvite = async (ids: string[]) =>
  ids.length
    ? (
        await db
          .select({ id: signupAllowlist.id, email: signupAllowlist.email, name: signupAllowlist.name, locale: signupAllowlist.locale, invitationSentAt: signupAllowlist.invitationSentAt, usedAt: signupAllowlist.usedAt, withdrawnAt: signupAllowlist.withdrawnAt })
          .from(signupAllowlist)
          .where(inArray(signupAllowlist.id, ids))
      ).filter(canInvite)
    : [];

/**
 * Sends each place its invitation, one at a time, and records it. A batch is 10
 * to 20, a few seconds. Answers go to the team (TEAM_EMAIL). Returns the emails
 * that failed, to try again; the others are marked sent.
 */
export async function sendInvitations(ids: string[]) {
  const admin = await requireStaff("admin");
  const failed: string[] = [];
  const places = await placesToInvite(ids);
  for (const place of places) {
    try {
      await sendEmail({ to: place.email, replyTo: process.env.TEAM_EMAIL || undefined, ...(await invitation(toLocale(place.locale), place)) });
      await db
        .update(signupAllowlist)
        .set({ invitationSentAt: sql`now()`, invitationSentBy: admin.personId })
        .where(eq(signupAllowlist.id, place.id));
    } catch (e) {
      failed.push(place.email);
      log.error("beta.invitation.failed", { person_id: admin.personId, error: e });
    }
  }
  return { sent: places.length - failed.length, failed };
}

/** Withdraws a place nobody has used: no one can sign up with it. A used one can't be (they have an account). */
export async function withdrawPlace(id: string) {
  const admin = await requireStaff("admin");
  const [row] = await db
    .update(signupAllowlist)
    .set({ withdrawnAt: sql`now()`, withdrawnBy: admin.personId })
    .where(and(eq(signupAllowlist.id, id), isNull(signupAllowlist.usedAt), isNull(signupAllowlist.withdrawnAt)))
    .returning({ id: signupAllowlist.id });
  return Boolean(row);
}
