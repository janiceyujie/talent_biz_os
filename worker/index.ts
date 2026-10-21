// The background worker: runs the jobs the app queues
// (docs/decisions/0014-hosting-and-job-queue.md).
//
//   npm run worker                  # beside npm run dev
//
// It also answers the web service's live questions about a mailbox on a
// private port (worker/http.ts), since only the worker can decrypt its token;
// runs the schedule (worker/schedule.ts); and pulls Gmail's push notices
// when Pub/Sub is set up (worker/push.ts). Several can run at once: each
// keeps a heartbeat, and a stopped one's jobs are released (worker/liveness.ts).
//
// It runs the app's own modules under the react-server condition, so their
// "server-only" imports resolve, and reads the same .env files as the app.
// Stop it with Ctrl-C (or SIGTERM on deploy): running jobs finish first.
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  // Imported after the environment is loaded: lib/db reads DATABASE_URL when it loads.
  const { parseCronItems, run } = await import("graphile-worker");
  const { taskList } = await import("./tasks");
  const { startHttp } = await import("./http");
  const { startPush } = await import("./push");
  const { schedule } = await import("./schedule");
  const { liveness } = await import("./liveness");
  const { pushMode } = await import("@/lib/mail/push-mode");
  const { checkCredentials } = await import("@/lib/mail/pubsub");
  // Push is required in production, and half set up is refused anywhere: refuse to start.
  const mode = pushMode();
  if (mode === "push") checkCredentials();
  console.log(mode === "push" ? "mail: push (Pub/Sub), with a 15-minute check as a safety net" : "mail: checked every 2 minutes (no PUBSUB_* settings; push is required in production)");
  const alive = liveness(); // a heartbeat, and releasing jobs a stopped worker left locked
  // Two pools, so the memory-heavy jobs (heavyJobs) run fewer at a time and never
  // hold up the rest. Each takes only its own jobs. They share the queue's
  // connections: through Supabase's session-mode pooler each one holds a database
  // connection for good (docs/setup/render.md, "Database connections").
  const { Pool } = await import("pg");
  const { heavyJobs } = await import("@/lib/queue/jobs");
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.WORKER_PG_POOL || 6) });
  // A connection that drops (the pooler restarting, say) is replaced; unhandled, its error
  // would crash the worker. Idle in the pool, or checked out between queries. The code only.
  const dropped = (e: Error & { code?: string }) => console.error("worker: a queue connection failed", e.code ?? e.name);
  pgPool.on("error", dropped);
  pgPool.on("connect", (client) => client.on("error", dropped));
  const isHeavy = ([name]: [string, unknown]) => (heavyJobs as readonly string[]).includes(name);
  const light = await run({
    events: alive.events,
    pgPool,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    taskList: Object.fromEntries(Object.entries(taskList).filter((t) => !isHeavy(t))),
    parsedCronItems: parseCronItems(schedule()),
  });
  const heavy = await run({
    events: alive.events,
    pgPool,
    concurrency: Number(process.env.WORKER_HEAVY_CONCURRENCY || 2),
    taskList: Object.fromEntries(Object.entries(taskList).filter(isHeavy)),
  });
  const http = startHttp();
  const push = startPush(); // Gmail notices, when Pub/Sub is set up; otherwise the schedule polls
  // On SIGTERM, Graphile stops both pools, letting running jobs finish.
  await Promise.all([light.promise, heavy.promise]);
  push?.stop();
  http?.close();
  await alive.stop();
  await pgPool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("worker", e);
  process.exit(1);
});
