// The background worker: runs the jobs the app queues
// (docs/decisions/0014-hosting-and-job-queue.md).
//
//   npm run worker                  # beside npm run dev
//
// It also answers the web service's live questions about a mailbox on a
// private port (worker/http.ts), since only the worker can decrypt its token.
//
// It runs the app's own modules under the react-server condition, so their
// "server-only" imports resolve, and reads the same .env files as the app.
// Stop it with Ctrl-C (or SIGTERM on deploy): running jobs finish first.
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  // Imported after the environment is loaded: lib/db reads DATABASE_URL when it loads.
  const { run, parseCronItems } = await import("graphile-worker");
  const { grantsLocalEnabled } = await import("@/lib/grants/config");
  const { taskList } = await import("./tasks");
  const { startHttp } = await import("./http");
  const { freeTierOk } = await import("@/lib/ai/model");
  freeTierOk(); // throws when AI_FREE_TIER_OK=1 in production: refuse to start
  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    taskList,
    parsedCronItems: parseCronItems([
      ...(grantsLocalEnabled()&&process.env.GRANTS_SYNC_ENABLED==="1"?[{task:"grants.refresh",match:"0 */6 * * *",options:{maxAttempts:3}}]:[]),
    ]),
  });
  const http = startHttp();
  await runner.promise;
  http?.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("worker", e);
  process.exit(1);
});
