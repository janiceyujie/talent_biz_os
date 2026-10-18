import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerHeartbeat } from "@/lib/db/schema";

// Releasing the jobs of a worker that stopped (docs/decisions/0014). Graphile
// frees a dead worker's locks only after 4 hours, and a locked job also holds
// its named queue (a mailbox's scoring, say). Each worker records that it's
// alive every 30 seconds; every minute, any worker releases the locks of a
// worker silent for 2 minutes. A busy worker keeps beating, so its jobs are
// never touched however long they run; any number of workers can run.

export const BEAT_MS = 30_000;
export const REAP_MS = 60_000;
const SILENT_MS = 2 * 60_000;

/** This worker is alive. */
export async function beat(workerId: string) {
  await db
    .insert(workerHeartbeat)
    .values({ workerId, seenAt: new Date() })
    .onConflictDoUpdate({ target: workerHeartbeat.workerId, set: { seenAt: new Date() } });
}

/** This worker stopped cleanly: nothing of its own to release later. */
export const forget = (workerId: string) => db.delete(workerHeartbeat).where(sql`${workerHeartbeat.workerId} = ${workerId}`);

/** No job runs longer than this (worker/tasks.ts): a lock older than it is never a live job's. */
export const JOB_LIMIT_MS = 10 * 60_000;

/**
 * Release the locks of workers that stopped: ones whose heartbeat went silent
 * 2 minutes ago, and ones never seen beating (a worker from before heartbeats,
 * during a rollout, or one that died before its first beat) once their lock
 * is past the job limit. Returns the workers released.
 */
export async function reapSilent(): Promise<string[]> {
  const rows = await db.execute<{ worker: string }>(sql`
    select distinct locked_by as worker from (
      select locked_by, locked_at from graphile_worker._private_jobs where locked_by is not null
      union all
      select locked_by, locked_at from graphile_worker._private_job_queues where locked_by is not null
    ) held
    left join ${workerHeartbeat} beat on beat.worker_id = held.locked_by
    where case
      when beat.worker_id is null then held.locked_at < now() - make_interval(secs => ${JOB_LIMIT_MS / 1000})
      else beat.seen_at < now() - make_interval(secs => ${SILENT_MS / 1000})
    end`);
  const dead = rows.map((r) => r.worker);
  if (dead.length)
    await db.execute(sql`select graphile_worker.force_unlock_workers(array[${sql.join(
      dead.map((w) => sql`${w}`),
      sql`, `,
    )}]::text[])`);
  // Heartbeats of workers long gone.
  await db.delete(workerHeartbeat).where(lt(workerHeartbeat.seenAt, new Date(Date.now() - 24 * 60 * 60_000)));
  return dead;
}
