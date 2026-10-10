// Installs or updates the job queue's own tables (Graphile Worker's
// graphile_worker schema), so the app can queue jobs before the worker has
// ever started. Run by `npm run db:migrate`, after the app's migrations.
import nextEnv from "@next/env";
import { runMigrations } from "graphile-worker";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
await runMigrations({ connectionString: process.env.DATABASE_URL });
