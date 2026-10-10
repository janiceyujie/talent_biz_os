# Talent Biz OS

A business operating layer for independent talent — musicians, influencers, models, and the people who manage them. See [docs/architecture.md](docs/architecture.md) for the full design. Known shortcuts and gaps are in [docs/tech-debt.md](docs/tech-debt.md).

## Development

Needs Node and Docker Desktop (running).

```bash
cp .env.example .env.local   # first time only, then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:start             # local Supabase: Postgres + Storage
npm run db:migrate           # apply migrations in drizzle/, then the job queue's tables
npm run dev
npm run worker               # in a second terminal: runs queued jobs (analysis)
```

Analysis and other background work run as jobs in the worker ([decision 0014](docs/decisions/0014-hosting-and-job-queue.md)). Without `npm run worker`, a pasted or uploaded message stays "Analyzing…" until the worker starts; nothing is lost.

Schema changes: edit `lib/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`. (Before the first production deploy the migrations are squashed into one baseline: see [docs/setup/launch-checklist.md](docs/setup/launch-checklist.md).) Sign-up sends a verification email; open it in Mailpit to finish. Google sign-in appears once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set.

Local tools: Supabase Studio at http://127.0.0.1:54323, Mailpit (catches outgoing email) at http://127.0.0.1:54324.

Open [http://localhost:3000](http://localhost:3000).
