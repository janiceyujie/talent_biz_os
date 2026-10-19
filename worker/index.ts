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
  const { freeTierOk } = await import("@/lib/ai/model");
  freeTierOk(); // throws when AI_FREE_TIER_OK=1 in production: refuse to start
  const { pushMode } = await import("@/lib/mail/push-mode");
  const { checkCredentials } = await import("@/lib/mail/pubsub");
  // Push is required in production, and half set up is refused anywhere: refuse to start.
  const mode = pushMode();
  if (mode === "push") checkCredentials();
  console.log(mode === "push" ? "mail: push (Pub/Sub), with a 15-minute check as a safety net" : "mail: checked every 2 minutes (no PUBSUB_* settings; push is required in production)");
  const alive = liveness(); // a heartbeat, and releasing jobs a stopped worker left locked
  const runner = await run({
    events: alive.events,
    connectionString: process.env.DATABASE_URL,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    taskList,
    parsedCronItems: parseCronItems(schedule()),
  });
  const http = startHttp();
  const push = startPush(); // Gmail notices, when Pub/Sub is set up; otherwise the schedule polls
  await runner.promise;
  push?.stop();
  http?.close();
  await alive.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("worker", e);
  process.exit(1);
});
