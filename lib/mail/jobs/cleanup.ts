import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { makeWorkerUtils } from "graphile-worker";
import { db } from "@/lib/db";
import { mailDecision } from "@/lib/db/schema";
import { expireNotices } from "./notice";

// mail.cleanup, daily on the worker's schedule (docs/design/gmail-ingestion.md, Jobs):
//   - skipped decisions older than 90 days: Filtered out stops at 90 days, and
//     the ids of mail never brought in aren't kept longer (decision 0013);
//   - payment notices left unhandled for 30 days (./notice.ts);
//   - jobs that gave up more than 14 days ago, and the queues and task names
//     nothing uses any more: Graphile keeps a failed job until it's deleted.

const DAY_MS = 24 * 60 * 60 * 1000;
export const SKIPPED_KEPT_DAYS = 90;
export const FAILED_JOBS_KEPT_DAYS = 14;

export async function cleanup() {
  const skipped = await db
    .delete(mailDecision)
    .where(and(eq(mailDecision.outcome, "skipped"), lt(mailDecision.createdAt, new Date(Date.now() - SKIPPED_KEPT_DAYS * DAY_MS))))
    .returning({ id: mailDecision.id });
  await expireNotices();
  // Graphile has no "older than" for failed jobs: its private table, the same one its own cleanup uses.
  const failed = await db.execute(
    sql`delete from graphile_worker._private_jobs where attempts >= max_attempts and locked_at is null and updated_at < now() - make_interval(days => ${FAILED_JOBS_KEPT_DAYS}) returning id`,
  );
  const utils = await makeWorkerUtils({ connectionString: process.env.DATABASE_URL });
  try {
    await utils.cleanup({ tasks: ["GC_JOB_QUEUES", "GC_TASK_IDENTIFIERS"] });
  } finally {
    await utils.release();
  }
  // Counts only.
  console.log("mail.cleanup", { skippedDecisions: skipped.length, failedJobs: failed.length });
}
