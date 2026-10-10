import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobAttempts, jobs, type JobName, type JobPayload } from "./jobs";

// The job queue (docs/decisions/0014-hosting-and-job-queue.md). Callers and
// handlers use this interface, never the queue library, so the library can
// change without touching them. The worker that runs the jobs is worker/.

export type { JobName, JobPayload };

/** The database, or a transaction on it. */
type Executor = Pick<typeof db, "execute">;

export interface EnqueueOptions {
  /** Add the job inside this transaction: it exists only if the transaction commits. */
  tx?: Executor;
  /** Jobs with the same queue name run one at a time, in the order they were added. */
  queueName?: string;
  /** A waiting job with the same key is replaced instead of a second one being added. */
  jobKey?: string;
  /** Not before this time. */
  runAt?: Date;
  /** Attempts before the job gives up and stays in the table with its last error (default: jobAttempts in ./jobs). */
  maxAttempts?: number;
}

export interface Queue {
  enqueue<N extends JobName>(name: N, payload: JobPayload<N>, options?: EnqueueOptions): Promise<void>;
}

/**
 * Graphile Worker: jobs live in our own Postgres and are added with its SQL
 * function, so adding one joins whatever transaction the caller is in.
 */
export const queue: Queue = {
  async enqueue(name, payload, { tx = db, queueName, jobKey, runAt, maxAttempts } = {}) {
    const checked = jobs[name].parse(payload);
    await tx.execute(sql`select 1 from graphile_worker.add_job(
      ${name}::text,
      ${JSON.stringify(checked)}::json,
      queue_name => ${queueName ?? null}::text,
      run_at => ${runAt?.toISOString() ?? null}::timestamptz,
      max_attempts => ${maxAttempts ?? jobAttempts[name]}::int,
      job_key => ${jobKey ?? null}::text
    )`);
  },
};
