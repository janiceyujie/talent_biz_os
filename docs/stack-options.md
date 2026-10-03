# Stack options

The analysis behind the stack decisions in [`architecture.md`](architecture.md#stack). Kept for review: what was weighed, why the choice won, what it costs, and what would make it worth revisiting.

Decided 2026-10-01, before M1 implementation. M1–M5 are the MVP build milestones (see `architecture.md#entity-model`).

## Context that shaped the choices

- **Part-time build, assisted by Claude Code.** Fewer integrations to wire and maintain matters more than flexibility we won't use yet.
- **Small, low-volume start.** A handful of solo artists, a few messages a day each. Nothing here needs to scale yet.
- **Sensitive data.** Contracts, fees, and payment terms — backups and access control matter from the first real user.
- **Users in Taiwan.** Asia-region hosting keeps latency down.
- **Avoid vendor lock-in.** Not because a specific move is planned, but so any hosted service can be swapped by moving data rather than rewriting the app.

## App shape

| Option | Verdict |
|---|---|
| **Next.js monolith** (route handlers + server actions) | ✅ Chosen. One deploy, shared types; the Gmail add-on webhook is just another route. |
| Next.js frontend + separate API (Hono, FastAPI) | Two deploys and cross-origin auth for no gain at this scale. No Python need — the AI work is API calls, not model training. |

**Revisit when:** a pipeline stage needs to scale independently, or the add-on webhook's response-time limit is threatened by other load. See "Splitting the monolith later" in `architecture.md`.

## Database, auth, and storage: bundle or separate pieces

| Option | Verdict |
|---|---|
| Supabase for everything (Postgres + pgvector + Auth + Storage) | Fewest integrations. But Supabase Auth's main advantage is tight RLS integration, which we chose not to rely on — so we'd take its lock-in for a benefit we don't use. |
| **Supabase for Postgres + Storage, Better Auth for login** | ✅ Chosen. Keeps Supabase's free local stack and bundled storage; identity lives in our own tables. |
| All separate: Neon + Better Auth + R2/S3 | Equally portable, roughly 2–3× the setup. A valid swap later — the portability rules make it cheap. |
| Firebase / NoSQL | Contracts, versions, and money need relational integrity. |

### Supabase pricing (as of 2026-10; verify at supabase.com/pricing)

| | Free | Pro (~US$25/mo) |
|---|---|---|
| Local dev (`supabase start`) | Always free (open source, Docker) | — |
| Database | ~500 MB | ~8 GB |
| File storage | ~1 GB | ~100 GB |
| Backups | None | Daily |
| Inactivity | Pauses after ~1 week idle | Never pauses |

Phases 1–2 run locally at no cost. Free tier covers the first deploy and early testers; move to Pro before real users' contracts land, for backups and no pausing. Claude API usage is billed separately and will likely cost more than the database.

## Login: Better Auth vs. alternatives

| Option | Verdict |
|---|---|
| **Better Auth** | ✅ Chosen. Users, sessions, and password hashes live in our Postgres; email/password and Google sign-in; Drizzle adapter. |
| Supabase Auth | Fine if relying on RLS or calling Supabase from the browser — we do neither. Identity in Supabase's `auth` schema is the hardest piece to migrate. |
| Clerk | Fastest setup with hosted login UI; user records live with Clerk and pricing grows with monthly users. |
| Auth.js (NextAuth) | Now in maintenance mode; its team joined Better Auth. |

**Costs we accept:** we wire a transactional email provider (needed with Supabase Auth too — its built-in sender is rate-limited to a few per hour); we keep the library updated ourselves; rate limiting and MFA are plugins we turn on.

Google sign-in is on from day one because the M3 Gmail add-on identifies users by their Google account.

## DB access and migrations

| Option | Verdict |
|---|---|
| **Drizzle** | ✅ Chosen. SQL-shaped typed queries, typed `jsonb` (extraction results), pgvector support, schema in TS; `drizzle-kit` generates SQL migration files from schema changes. Works on any Postgres. |
| Prisma | Own schema language, weaker pgvector support (workarounds for vector columns), heavier abstraction. |
| Supabase client only | Awkward for multi-table transactions like confirming a review; ties every query to the vendor. |
| Raw SQL | No type safety; a renamed column fails at runtime instead of at build. |

## Internationalization

Decided 2026-10-02. MVP: `zh-TW` and `en`; built so more languages are a file, not a rewrite.

| Option | Verdict |
|---|---|
| **`next-intl`** | ✅ Chosen. Built for the App Router: one API across server components, client components, server actions, metadata, and route handlers — we use all five. ICU messages, locale-aware date/number/currency formatting with time zones, typed keys, and a mode without locale routing. Supports Next 16. |
| Next.js dictionary pattern (`getDictionary`) | No plurals or interpolation, no client hook, and formatting and fallback are ours to build. Fine for a static site, thin for an app. |
| `react-i18next` | Mature, but not built around server components; more wiring for server actions and RSC. |
| Lingui | Good extraction and compile-time catalogs; adds a build step and macros we don't need at two languages. |
| Paraglide (inlang) | Compile-time, tree-shaken messages; newer, and its tooling assumes the inlang workflow. |

| Decision | Choice | Why |
|---|---|---|
| Locale in URL | No | The app is behind a login: per-language URLs buy no indexing and would restructure every route. |
| Default locale | `zh-TW` | The first users are in Taiwan. |
| Reference / fallback locale | `en` | Translators and translation tools work from English; a missing key in a future language falls back to something most people read. Costs nothing now, since the check script keeps both catalogs complete. |
| Template placeholders | Language-neutral keys, localized display | `{{合作方}}` stored in a user's template can't work in an English template, or vice versa. |
| AI draft language | The incoming message's language, with override | UI language and content language differ: a Chinese UI user still replies to English email in English. |

**Revisit when:** a third language arrives (add a translation-management service — Crowdin, Lokalise, Tolgee — reading the same JSON), or public pages need localized URLs.

## Deferred decisions

- **Job queue (M2).** Start with Next.js `after()` to run extraction after an upload is accepted, using `message.status` as the state machine. Move to pg-boss (needs a long-lived worker) or Inngest / Trigger.dev (serverless-friendly) when that stops being enough.
- **Hosting (M2).** Vercel is the smoothest for Next.js but can't run a long-lived worker; Fly.io or Render can. Decide with the queue.
- **Embeddings (M4).** Claude has no embeddings API; Anthropic points to Voyage AI. Any provider works since vectors are stored in pgvector.

## Leaving Supabase later

Not planned — this is what the portability rules buy.

| Piece | Move | Effort |
|---|---|---|
| Database | `pg_dump` / `pg_restore` to any Postgres host with pgvector (RDS, Neon, Cloud SQL, etc.). Drizzle code unchanged. | Low |
| Files | Copy the bucket with `rclone` or any S3 tool; change the storage endpoint. Stored keys stay valid. | Low |
| Login | None — Better Auth's tables move with the database. Sessions survive. | None |
| Authorization | None — it's in app code, not RLS. | None |
| App hosting | Unaffected — the app never ran on Supabase. | None |

Estimated at a few days, mostly testing and one planned downtime window for the database copy. If the portability rules are broken (Supabase client calls, RLS policies, stored URLs, Supabase Auth), it becomes weeks.
