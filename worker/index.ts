// The background worker: runs the jobs the app queues
// (docs/decisions/0014-hosting-and-job-queue.md).
//
//   npm run worker                  # beside npm run dev
//
// It runs the app's own modules under the react-server condition, so their
// "server-only" imports resolve, and reads the same .env files as the app.
// Stop it with Ctrl-C (or SIGTERM on deploy): running jobs finish first.
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  // Imported after the environment is loaded: lib/db reads DATABASE_URL when it loads.
  const { run } = await import("graphile-worker");
  const { taskList } = await import("./tasks");
  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    taskList,
    parsedCronItems: [], // no scheduled jobs yet
  });
  await runner.promise;
  process.exit(0);
}

main().catch((e) => {
  console.error("worker", e);
  process.exit(1);
});
