# Launch checklist

What has to happen before the first production deploy and before real users. Each item links where it was decided; this file only collects them. Tick items off in the pull request that does them.

## 1. Hosting and the job queue

- [x] Hosting and job queue, together: Render in Singapore and Graphile Worker ([decision 0014](../decisions/0014-hosting-and-job-queue.md)).
- [ ] Supabase on the Pro plan (backups, no idle pausing) before the first person besides the builder connects Gmail.
- [ ] `Dockerfile` and `render.yaml`; the worker on the session-mode pooler.
- [x] Move message analysis off `after()` to the queue (decision 0008).
- [x] Move Google Calendar sync off `after()` to the queue (decision 0009); `lib/calendar/google/sync.ts` first needs its `next/*` imports moved out (decision 0014).
- [x] Retry failed Google Calendar pushes from the queue, waiting longer after each failure (e.g. 1 min, 5 min, 30 min, 2 h, then every 6 h). Retry network errors, Google being down, and Google's "slow down"; not lost access (the person reconnects) or a request Google rejects (it would fail the same way). Until then a failed push stays pending and goes on the next change or 立即同步.

## 2. Squash the database migrations into one baseline

Development has added a migration per schema change (`drizzle/0000` … `0019`). Before the production database exists, replace them with one baseline, so production starts clean and every later change is a new migration on top of it — which is what lets later releases change the schema without interrupting people.

Do this **once**, as late as possible (right before creating the production database), because every existing database has to be rebuilt afterwards.

1. **Check the hand-written migrations.** The baseline is generated from `lib/db/schema.ts`, so anything only a migration file did is dropped. As of `0019` there are two, both one-off conversions of development data, safe to drop:
   - `0008_payment_voided_at.sql` — renames payments' archive column to `voided_at`.
   - `0013_analysis_intent.sql` — renames `message_type` to `intent` and converts old values.

   Look again for anything added since: `grep -n -i "update \|insert into\|create function\|create trigger" drizzle/*.sql`. Functions, triggers, extensions, or seed data written by hand need carrying into the baseline.
2. **Generate the baseline.** Move `drizzle/` aside, run `npm run db:generate` to produce a single `0000_…sql` from the current schema, and name it (e.g. `0000_baseline.sql`).
3. **Prove it's identical.** Build one empty database from the old migrations and one from the baseline, dump both schemas (`pg_dump --schema-only`), and compare. They should match exactly (constraint names, indexes, row-level security).
4. **Rebuild every development database.** `npx supabase db reset`, then `npm run db:migrate`. Local data is lost; re-create test accounts.
5. **From here on**, never edit or delete a migration that has run in production. Each change is a new generated migration, reviewed as SQL, and written so the running app keeps working while it applies (add before remove; rename in steps).

## 3. Secrets and environment

- [ ] A strong `BETTER_AUTH_SECRET` per environment, never reused from development. It encrypts stored Google tokens (decision 0009); changing it later forces everyone to reconnect Google.
- [ ] `BETTER_AUTH_URL` set to the production address.
- [ ] No test settings in production: `GOOGLE_TEST_STUB`, `AI_REPLAY`, `GOOGLE_CALENDAR_API_URL`, `GOOGLE_OAUTH_REVOKE_URL`, `NEXT_DIST_DIR`, `GMAIL_API_URL`, `GOOGLE_OAUTH_TOKEN_URL`, `MAIL_KEY_DEV` unset; `APP_ENV=production`.
- [ ] Cloud KMS key in Singapore; an encrypt-only credential on the web service and a decrypt-only one on the worker ([decision 0016](../decisions/0016-mailbox-tokens-and-key-management.md)).
- [ ] Email: a real SMTP provider (architecture doc, "Transactional email").
- [ ] Storage: a production bucket and keys (`STORAGE_*`).
- [ ] `STORAGE_*` also set wherever `npm run db:migrate` runs on deploy: after the migrations it publishes the contract and quote templates, uploading their Word files ([decision 0020](../decisions/0020-document-templates-are-data.md)).

## 4. Google

- [ ] A production Google Cloud project and OAuth client ([google-sign-in.md](google-sign-in.md), "After deploying").
- [ ] A domain, verified in Search Console; home page, privacy policy, and terms on it; a shared support email (Google Group or Workspace) on the consent screen.
- [ ] Publish sign-in (basic scopes, no review).
- [ ] Google verification for the calendar scopes, with a demo video ([google-calendar.md](google-calendar.md), "Before real users"). Add them to the production consent screen once it passes, so sign-in isn't held up.
- [ ] Google Calendar change notices ([calendar-two-way](../design/calendar-two-way.md), branch `calendar-webhooks`): `POST /api/calendar/notify` on the production HTTPS address, checking each channel's token; a watch on every connection's own calendar and each chosen calendar, renewed by syncs before it ends and stopped on disconnect; `calendar.reconcile` slowed from 5 to 30 minutes as the safety net, since Google doesn't promise delivery and stores nothing while we're down. Check by hand: an event moved in Google shows here within seconds.
- [ ] The consent screen moved from Testing to In production before anyone besides the builder connects Gmail (Testing expires refresh tokens after 7 days).
- [ ] Google verification for `gmail.readonly`, then the CASA security assessment ([decision 0013](../decisions/0013-connected-gmail-mailbox.md)); until both pass, at most 100 users.
- [ ] Pub/Sub topic with publish rights for Gmail, and the worker's pull subscription, its settings on the worker (required: the worker refuses to start in production without them).

## 5. AI

From [decision 0008](../decisions/0008-ai-operations.md):

- [x] OpenAI and Anthropic behind the provider seam, each with its own key and a spending cap; `AI_PRIMARY` and `AI_BACKUP` set ([decision 0015](../decisions/0015-production-model-providers.md)).
- [x] The Gemini and Ollama adapters, `AI_PROVIDER_KEEPS_DATA`, and `AI_FREE_TIER_OK` removed ([decision 0022](../decisions/0022-paid-providers-only.md)).
- [ ] A permanent line that content is analyzed by AI; the privacy policy names both providers.
- [ ] A cap on PDF pages and on the model's output length.
- [ ] Per-month and short-burst limits.
- [ ] Rate limits on server actions and the upload and file routes.
- [x] A switch to pause AI app-wide (`AI_PAUSED`), and a daily spending cap that pauses it on its own (`AI_DAILY_SPEND_CAP_USD`).
- [ ] A monthly spending limit and usage alerts set in the Anthropic and OpenAI consoles for the production keys (around $300 a month to start): the hard cap behind the app's estimate.
- [ ] `AI_ALERT_EMAIL` set, so a tripped spending cap reaches someone.
- [ ] Pause and resume tried once on the deployed web service and worker: with `AI_PAUSED=1`, paste a made-up message and see it wait as Paused; unset it and see the message analyzed within about 5 minutes. Then set `AI_DAILY_SPEND_CAP_USD` below the day's spend and see the alert email arrive. (Done locally for PR #28; the deployed run checks the real worker and mail provider.)

## 6. Operations

- [ ] Database backups, and a restore tried once.
- [ ] Error reporting and logs somewhere you'll see them.
- [ ] A way to delete an account and everything in it, on request (privacy policy).

## 7. Legal

- [ ] Terms of service and a privacy policy, as pages in the app (Google's consent screen links to them too, section 4). The terms include the template clause from [decision 0020](../decisions/0020-document-templates-are-data.md): Taloox isn't a law firm, its templates are self-help documents and not legal advice, using them creates no lawyer–client relationship, and the person is responsible for what they sign.
- [ ] The template library's disclaimer links to those terms.
- [ ] A lawyer reviews the contract and quote templates, the disclaimer under the library, and the note at the top of every Word file.
