// Applies the app's migrations (drizzle/), then installs or updates the job
// queue's own tables (Graphile Worker's graphile_worker schema), so the app can
// queue jobs before the worker has ever started.
//
//   npm run db:migrate                  # locally, through tsx
//   node dist/migrate.mjs               # deployed: the worker's pre-deploy command (render.yaml)
//
// It uses drizzle-orm's migrator rather than drizzle-kit, so the deployed image
// needs no dev dependencies. Both record applied migrations in the same table
// (drizzle.__drizzle_migrations), so either can run against the same database.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { runMigrations } from "graphile-worker";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
} finally {
  await client.end();
}
await runMigrations({ connectionString: url });
console.log("migrations applied");
