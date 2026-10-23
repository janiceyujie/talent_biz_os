// Applies the app's migrations (drizzle/), then installs or updates the job
// queue's own tables (Graphile Worker's graphile_worker schema), so the app can
// queue jobs before the worker has ever started.
//
//   npm run db:migrate                  # locally, through tsx
//   node dist/migrate.mjs               # deployed: the worker's pre-deploy command (render.yaml)
//
// Both are followed by scripts/publish-templates.mts (decision 0020).
//
// It uses drizzle-orm's migrator rather than drizzle-kit, so the deployed image
// needs no dev dependencies. Both record applied migrations in the same table
// (drizzle.__drizzle_migrations), so either can run against the same database.
//
// First it refuses to go on while the queue holds jobs this version has no
// handler for (a job name retired too soon, lib/queue/jobs.ts): nothing would
// ever run them. Deployed, that stops the deploy and the old version keeps running.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { runMigrations } from "graphile-worker";
import postgres from "postgres";
import { jobs } from "@/lib/queue/jobs";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  // Jobs that will still run (not given up), under a name this version doesn't handle.
  const [{ queue }] = await client`select to_regclass('graphile_worker.jobs') is not null as queue`;
  const orphans = queue
    ? await client`
        select task_identifier as name, count(*)::int as count from graphile_worker.jobs
        where attempts < max_attempts and task_identifier <> all(${Object.keys(jobs)}::text[])
        group by task_identifier`
    : [];
  if (orphans.length) {
    console.error(
      "Not migrating: the queue holds jobs this version can't run. Keep their handlers until they drain, then deploy again.",
      orphans.map(({ name, count }) => `${name} (${count})`).join(", "),
    );
    process.exit(1);
  }
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
} finally {
  await client.end();
}
await runMigrations({ connectionString: url });
console.log("migrations applied");
