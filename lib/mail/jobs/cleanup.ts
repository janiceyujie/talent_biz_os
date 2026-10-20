import "server-only";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { makeWorkerUtils } from "graphile-worker";
import { db } from "@/lib/db";
import { calendarEvent, mailDecision } from "@/lib/db/schema";
import { expireNotices } from "./notice";

// mail.cleanup, daily on the worker's schedule (docs/design/gmail-ingestion.md, Jobs):
//   - skipped decisions older than 90 days: Filtered out stops at 90 days, and
//     the ids of mail never brought in aren't kept longer (decision 0013);
//   - payment notices left unhandled for 30 days (./notice.ts);
//   - events deleted in Google Calendar more than 30 days ago: hidden since,
//     kept so a Restore can come later (decision 0017);
//   - jobs that gave up more than 14 days ago, and the queues nothing uses any
//     more: Graphile keeps a failed job until it's deleted.
//
// Never Graphile's GC_TASK_IDENTIFIERS: a running worker remembers each task
// name's id, and a name deleted under it comes back with a new id when a job
// is next queued, which that worker never takes (jobs waited until a restart).

const DAY_MS = 24 * 60 * 60 * 1000;
export const SKIPPED_KEPT_DAYS = 90;
export const FAILED_JOBS_KEPT_DAYS = 14;
export const DELETED_IN_GOOGLE_KEPT_DAYS = 30;

export async function cleanup() {
  const skipped = await db
    .delete(mailDecision)
    .where(and(eq(mailDecision.outcome, "skipped"), lt(mailDecision.createdAt, new Date(Date.now() - SKIPPED_KEPT_DAYS * DAY_MS))))
    .returning({ id: mailDecision.id });
  await expireNotices();
  const deletedEvents = await db
    .delete(calendarEvent)
    .where(and(isNotNull(calendarEvent.deletedInGoogleAt), lt(calendarEvent.deletedInGoogleAt, new Date(Date.now() - DELETED_IN_GOOGLE_KEPT_DAYS * DAY_MS))))
    .returning({ id: calendarEvent.id });
  // Graphile has no "older than" for failed jobs: its private table, the same one its own cleanup uses.
  const failed = await db.execute(
    sql`delete from graphile_worker._private_jobs where attempts >= max_attempts and locked_at is null and updated_at < now() - make_interval(days => ${FAILED_JOBS_KEPT_DAYS}) returning id`,
  );
  const utils = await makeWorkerUtils({ connectionString: process.env.DATABASE_URL });
  try {
    await utils.cleanup({ tasks: ["GC_JOB_QUEUES"] });
  } finally {
    await utils.release();
  }
  // Counts only.
  console.log("mail.cleanup", { skippedDecisions: skipped.length, failedJobs: failed.length, deletedEvents: deletedEvents.length });
}
