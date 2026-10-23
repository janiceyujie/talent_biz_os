import "server-only";
import { and, countDistinct, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { aiCall, auditLog, calendarConnection, mailConnection, mailDecision, membership, message, person, talent } from "@/lib/db/schema";
import { aiCallColumns, auditColumns, calendarConnectionColumns, failedJobColumns, mailConnectionColumns, mailDecisionColumns, messageColumns, personColumns, TIMELINE_LIMIT, workspaceColumns } from "./columns";

export { TIMELINE_LIMIT } from "./columns";

// The Support page's reads (decision 0026): the one place that reads across
// accounts, so the one place that may. Everything else stays scoped to the
// signed-in talent.
//
// - Every function calls requireStaff first, so none can be reached without it,
//   and revoking access takes effect on the next read.
// - Only metadata leaves: ids, statuses, codes, counts, and times. The columns
//   each read takes are listed in ./columns.ts, and support.test.ts checks no
//   column that holds mail or free text is among them.

/** The account that signs in with this email, or null. Exact match only: no browsing by part of an address. */
export async function findPerson(email: string) {
  await requireStaff();
  const [row] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, email.trim().toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

/** An account, its workspaces, and their connections; null when there's no such person. */
export async function accountOf(personId: string) {
  await requireStaff();
  const [account] = await db.select(personColumns).from(person).where(eq(person.id, personId)).limit(1);
  if (!account) return null;
  const workspaces = await db
    .select(workspaceColumns)
    .from(membership)
    .innerJoin(talent, eq(talent.id, membership.talentId))
    .where(eq(membership.personId, personId))
    .orderBy(membership.createdAt);
  const talentIds = workspaces.map((w) => w.talentId);
  if (!talentIds.length) return { account, workspaces, mailboxes: [], calendars: [] };
  const [mailboxes, calendars] = await Promise.all([
    db.select(mailConnectionColumns).from(mailConnection).where(inArray(mailConnection.talentId, talentIds)),
    db.select(calendarConnectionColumns).from(calendarConnection).where(eq(calendarConnection.personId, personId)),
  ]);
  return { account, workspaces, mailboxes, calendars };
}

export type TimelineEntry =
  | ({ type: "audit" } & Awaited<ReturnType<typeof auditOf>>[number])
  | ({ type: "ai" } & Awaited<ReturnType<typeof aiCallsOf>>[number])
  | ({ type: "mail" } & Awaited<ReturnType<typeof mailDecisionsOf>>[number])
  | ({ type: "message" } & Awaited<ReturnType<typeof messagesOf>>[number])
  | ({ type: "job" } & FailedJob);

/** What happened in these workspaces lately, newest first: up to TIMELINE_LIMIT of each kind. */
export async function timelineOf(talentIds: string[]): Promise<TimelineEntry[]> {
  await requireStaff();
  if (!talentIds.length) return [];
  const [audit, ai, mail, messages, jobs] = await Promise.all([auditOf(talentIds), aiCallsOf(talentIds), mailDecisionsOf(talentIds), messagesOf(talentIds), failedJobsOf(talentIds)]);
  const entries: TimelineEntry[] = [
    ...audit.map((e) => ({ type: "audit" as const, ...e })),
    ...ai.map((e) => ({ type: "ai" as const, ...e })),
    ...mail.map((e) => ({ type: "mail" as const, ...e })),
    ...messages.map((e) => ({ type: "message" as const, ...e })),
    ...jobs.map((e) => ({ type: "job" as const, ...e })),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Support's own views are left out: the account's summary counts them (supportViewsOf), and here they'd crowd out what the person did.
const auditOf = (talentIds: string[]) =>
  db
    .select(auditColumns)
    .from(auditLog)
    .where(and(inArray(auditLog.talentId, talentIds), ne(auditLog.action, SUPPORT_VIEWED)))
    .orderBy(desc(auditLog.createdAt))
    .limit(TIMELINE_LIMIT);
const aiCallsOf = (talentIds: string[]) =>
  db.select(aiCallColumns).from(aiCall).where(inArray(aiCall.talentId, talentIds)).orderBy(desc(aiCall.createdAt)).limit(TIMELINE_LIMIT);
const mailDecisionsOf = (talentIds: string[]) =>
  db.select(mailDecisionColumns).from(mailDecision).where(inArray(mailDecision.talentId, talentIds)).orderBy(desc(mailDecision.receivedAt)).limit(TIMELINE_LIMIT);
const messagesOf = (talentIds: string[]) =>
  db.select(messageColumns).from(message).where(inArray(message.talentId, talentIds)).orderBy(desc(message.receivedAt)).limit(TIMELINE_LIMIT);

type FailedJob = { id: string; at: Date; job: string; attempts: number; maxAttempts: number; ids: Record<string, string> };

/**
 * Jobs that gave up, for these workspaces. A job's payload carries ids only
 * (lib/queue/jobs.ts); which workspace it was for comes from the row each id names.
 */
async function failedJobsOf(talentIds: string[]): Promise<FailedJob[]> {
  const ids = sql.join(
    talentIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute<{ id: string; task_identifier: string; attempts: number; max_attempts: number; payload: Record<string, unknown>; updated_at: string }>(sql`
    select ${sql.raw(Object.entries(failedJobColumns).map(([name, source]) => `${source} as ${name}`).join(", "))}
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where j.attempts >= j.max_attempts
      and (
        j.payload->>'connectionId' in (select id::text from mail_connection where talent_id in (${ids})
                                       union select id::text from calendar_connection where talent_id in (${ids}))
        or j.payload->>'decisionId' in (select id::text from mail_decision where talent_id in (${ids}))
        or j.payload->>'messageId' in (select id::text from message where talent_id in (${ids}))
      )
    order by j.updated_at desc
    limit ${TIMELINE_LIMIT}
  `);
  return rows.map((r) => ({
    id: String(r.id),
    at: new Date(r.updated_at),
    job: r.task_identifier,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    // Only the ids: a payload holds nothing else today, and this keeps it so if one ever does.
    ids: Object.fromEntries(Object.entries(r.payload ?? {}).filter((e): e is [string, string] => /Id$/.test(e[0]) && typeof e[1] === "string")),
  }));
}

const SUPPORT_VIEWED = "support.viewed";
/** One staff member opening the same account again within this long is the same look, recorded once. */
const VIEW_WINDOW = sql`interval '30 minutes'`;

/**
 * Records that staff opened this account (decision 0026): a support.viewed row in
 * each of its workspaces' history, so the account's own record shows when support
 * looked, and who. Once per staff member per account per 30 minutes, so reloading
 * the page isn't a new look.
 */
export async function recordView(personId: string, talentIds: string[]) {
  const viewer = await requireStaff();
  if (!talentIds.length) return;
  const [recent] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, SUPPORT_VIEWED),
        eq(auditLog.targetId, personId),
        eq(auditLog.actorPersonId, viewer.personId),
        gt(auditLog.createdAt, sql`now() - ${VIEW_WINDOW}`),
      ),
    )
    .limit(1);
  if (recent) return;
  await db.insert(auditLog).values(
    talentIds.map((talentId) => ({ talentId, actorPersonId: viewer.personId, action: SUPPORT_VIEWED, targetType: "person", targetId: personId })),
  );
}

/**
 * Support's earlier looks at this account: the latest, by whom, and how many in
 * 30 days. One look writes a row per workspace, all at one time, so looks are
 * counted by time. Read before this look is recorded.
 */
export async function supportViewsOf(personId: string) {
  await requireStaff();
  const [latest] = await db
    .select({ at: auditLog.createdAt, by: auditLog.actorPersonId })
    .from(auditLog)
    .where(and(eq(auditLog.action, SUPPORT_VIEWED), eq(auditLog.targetId, personId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (!latest) return null;
  const [{ count }] = await db
    .select({ count: countDistinct(auditLog.createdAt) })
    .from(auditLog)
    .where(and(eq(auditLog.action, SUPPORT_VIEWED), eq(auditLog.targetId, personId), gt(auditLog.createdAt, sql`now() - interval '30 days'`)));
  return { ...latest, count };
}

/** Where the Support page's links point (./links.ts): the services' ids and Sentry's organization. */
export function searchTargets() {
  return {
    renderWeb: process.env.RENDER_SERVICE_ID || null, // set by Render on each service
    renderWorker: process.env.RENDER_WORKER_SERVICE_ID || null, // set by hand: Render tells a service only its own id
    sentryOrg: process.env.SENTRY_ORG || null,
  };
}
