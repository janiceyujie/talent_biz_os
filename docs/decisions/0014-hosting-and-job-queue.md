# 0014 — Singapore on Supabase and Render, with Graphile Worker as the job queue

**Status:** Accepted (2026-10-10)

## Context

Hosting and the job queue have been open since M2, decided together because serverless hosting can't run a long-lived worker. Until now, background work ran in `after()` inside the web request. Reading a connected mailbox (decision 0013) makes a long-lived worker unavoidable: pulling Gmail change notices, daily watch renewal, a 15-minute reconciliation poll, fetching, analysis, and Calendar retries all run when nobody is in the app.

The forces:

- Users are in Taiwan; no provider offers a Taiwan region for Postgres.
- Volume is small: at most 100 test users before Google verification, about 0.1 emails a second.
- One part-time builder: operating effort matters far more than throughput.
- The app, the worker, and the database must share a region; pages run many small queries.
- The repo already assumes Supabase (local `supabase start`, Storage through its S3 API) and Drizzle on `postgres.js`.

## Decision

### Region: Singapore

The database, files, web service, and worker all run in Singapore. Latency from Taipei is about 50 ms (Tokyo about 35 ms), unnoticeable when clicking around, and Singapore keeps every host option open.

### Database and files: Supabase

- A Supabase project in Singapore: Postgres with pgvector, and Storage through its S3 API, as the code already assumes.
- Free plan while only the builder tests; **Pro before the first other person connects Gmail**, for daily backups and no idle pausing.
- The worker connects through Supabase's **session-mode pooler** (IPv4, a stable session for the queue's `LISTEN`); the web service may use transaction mode.

### Web and worker: Render

- **One Docker image, two Render services:** a web service (`next start`) and a background worker (`npm run worker`), both in Singapore, configured by a `render.yaml` blueprint in the repo.
- Fixed per-instance pricing, so a stuck retry loop can't run up a bill.
- The host only has to exist before the first person besides the builder connects; with Pub/Sub pull, the whole flow runs locally.

### Job queue: Graphile Worker

- Jobs live in our Postgres (its own `graphile_worker` schema).
- **Enqueue inside our own transactions** with plain SQL (`select graphile_worker.add_job(...)`) in a Drizzle transaction, so "message saved" and "analysis queued" happen together or not at all.
- **Named queues run one job at a time**: one per mailbox, so two syncs never move the same cursor.
- Retries with exponential backoff; jobs that give up stay in the table with their last error and are replayed by resetting them. Scheduled jobs (watch renewal, the reconciliation poll, expiries) use its crontab.
- **Handlers go through a small `Queue` interface** in `lib/`, never Graphile directly. Every handler is safe to run twice (dedupe on the Gmail message id and `message.dedup_key`). **Jobs carry ids, never content.**
- Message analysis and Google Calendar sync move off `after()` onto the queue when it's introduced.

### Code shape

- The pipeline modules (mail sync, relevance, fetch, analysis, matching) import nothing from `next/*`. Thin wrappers in `lib/actions/` and `app/api/` call them; the worker runs them with `--conditions=react-server` so `"server-only"` resolves, as `npm run eval:extraction` already does.
- `lib/calendar/google/sync.ts` (which imports `next/server` and `next-intl/server`) gets that seam before Calendar retries move to the worker.
- Google APIs (Gmail, Pub/Sub, KMS) are called with plain `fetch`, as `lib/calendar/google/api.ts` already does, not through Google's SDKs.

## Alternatives considered

- **Tokyo.** Slightly lower latency; rules out Render and Railway, the two simplest hosts for a web app plus a worker.
- **Neon, Render Postgres, or AWS RDS.** All fine Postgres; each needs a separate file store and changes local development. Leaving Supabase stays cheap ([stack-options](../stack-options.md), "Leaving Supabase later").
- **Vercel with Inngest.** The best Next.js deploys, but no worker, so a second vendor would run the jobs and sit in the path of every email.
- **Railway.** Close second: usage-based billing, per-PR environments. Nothing else in the design changes if we move.
- **Fly.io, Cloud Run.** More to configure for one person. Cloud Run in Taiwan would put the app in a different cloud and city from the database.
- **pg-boss.** Comparable features, but it uses the `pg` driver and joining our `postgres.js` transactions needs an adapter.
- **pgmq.** Plain SQL and no npm dependency, but retries, dead letters, scheduling, and dedupe would all be ours to write.
- **Kafka.** An event log for many independent consumers at high volume, with replay. Our volume is about four orders of magnitude below where it pays; Pub/Sub already plays that role at the one edge where it matters (Gmail's notices). Replay comes from stored decisions and analyses re-queued by id.

## Consequences

- New dependencies: `graphile-worker` (and `pg`, which it uses).
- A `Dockerfile`, `render.yaml`, and `npm run worker`; development runs `npm run worker` beside `npm run dev`.
- Paid hosting: Supabase Pro and two small Render instances, before the first external user.
- If throughput ever outgrows Postgres (sustained hundreds of jobs a second), the `Queue` interface, idempotent handlers, and id-only jobs make a move to another queue a change of plumbing.

## Implementation notes (2026-10-10)

- `lib/queue/jobs.ts` lists every job and its payload schema (strict, ids only); `lib/queue/index.ts` is the `Queue` interface and its Graphile Worker implementation, which calls `graphile_worker.add_job` through Drizzle so a `tx` option joins the caller's transaction.
- `worker/index.ts` (`npm run worker`) loads the `.env` files, then runs the handlers in `worker/tasks.ts`. `npm run db:migrate` installs the queue's own schema after the app's migrations (`scripts/queue-migrate.mts`), so the app can queue jobs before the worker first starts.
- Paste, upload, and Retry queue `message.analyze` in the same transaction as their write, keyed per message so a second request replaces a waiting job. `analyzeMessage` skips a message that is no longer pending, so a job that runs twice analyzes once.
- Each job sets its own attempt limit in `jobAttempts` (`lib/queue/jobs.ts`) instead of Graphile's default of 25, which keeps retrying for about 3 days. `message.analyze` gets 5 (about 1.5 minutes): model errors don't throw, they mark the message error for the person to Retry, so only failures such as the database being down are retried. If the last attempt still throws, the handler marks the message error (`unexpected`) so it shows Retry instead of staying pending.
- Google Calendar sync still runs in `after()` until its module drops its `next/*` imports.
