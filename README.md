# Talent Biz OS

A business operating layer for independent talent — musicians, influencers, models, and the people who manage them. See [docs/architecture.md](docs/architecture.md) for the full design.

## Development

Needs Node and Docker Desktop (running).

```bash
cp .env.example .env.local   # first time only
npm run db:start             # local Supabase: Postgres + Storage
npm run db:migrate           # apply migrations in drizzle/
npm run dev
```

Schema changes: edit `lib/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`. Local tools: Supabase Studio at http://127.0.0.1:54323, Mailpit (catches outgoing email) at http://127.0.0.1:54324.

Open [http://localhost:3000](http://localhost:3000).
