# Launch checklist

What has to happen before the first production deploy and before real users. Each item links where it was decided; this file only collects them. Tick items off in the pull request that does them.

## 1. Decide hosting and the job queue

- [ ] Hosting and job queue, together (architecture doc, "Stack": open since M2). Serverless hosting can't run a long-lived worker, so the queue choice depends on it.
- [ ] Move background work off `after()` to the queue: message analysis (decision 0008), Google Calendar sync (decision 0009).
- [ ] Retry failed Google Calendar pushes from the queue, waiting longer after each failure (e.g. 1 min, 5 min, 30 min, 2 h, then every 6 h). Retry network errors, Google being down, and Google's "slow down"; not lost access (the person reconnects) or a request Google rejects (it would fail the same way). Until then a failed push stays pending and goes on the next change or 立即同步.

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
- [ ] No test settings in production: `GOOGLE_TEST_STUB`, `AI_REPLAY`, `GOOGLE_CALENDAR_API_URL`, `GOOGLE_OAUTH_REVOKE_URL`, `NEXT_DIST_DIR` unset.
- [ ] Email: a real SMTP provider (architecture doc, "Transactional email").
- [ ] Storage: a production bucket and keys (`STORAGE_*`).

## 4. Google

- [ ] A production Google Cloud project and OAuth client ([google-sign-in.md](google-sign-in.md), "After deploying").
- [ ] A domain, verified in Search Console; home page, privacy policy, and terms on it; a shared support email (Google Group or Workspace) on the consent screen.
- [ ] Publish sign-in (basic scopes, no review).
- [ ] Google verification for the calendar scopes, with a demo video ([google-calendar.md](google-calendar.md), "Before real users"). Add them to the production consent screen once it passes, so sign-in isn't held up.
- [ ] Calendar change notifications and sync tokens replacing polling (decision 0009, phase 2).

## 5. AI

From [decision 0008](../decisions/0008-ai-operations.md):

- [ ] The paid model behind the provider seam, with its own key and a spending cap.
- [ ] `AI_PROVIDER_KEEPS_DATA` off; a permanent line that content is analyzed by AI; the privacy policy says so.
- [ ] A cap on PDF pages and on the model's output length.
- [ ] Per-month and short-burst limits.
- [ ] Rate limits on server actions and the upload and file routes.
- [ ] A switch to pause AI app-wide.

## 6. Operations

- [ ] Database backups, and a restore tried once.
- [ ] Error reporting and logs somewhere you'll see them.
- [ ] A way to delete an account and everything in it, on request (privacy policy).
