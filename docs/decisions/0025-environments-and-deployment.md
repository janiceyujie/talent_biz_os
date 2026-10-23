# 0025 — Three environments, deploys driven by GitHub Actions, secrets kept in Render

**Status:** Accepted (2026-10-21)

## Context

Decision 0014 put the app on Render (a web service and a worker private service, one image) and the database and files on Supabase, all in Singapore. It didn't say how code gets there, how many copies of the system exist, or where their secrets live. CI already runs on every pull request (`.github/workflows/ci.yml`: lint, type check, tests, translations, build); nothing deploys.

The forces:

- One part-time builder, in beta, with real customers' mail arriving once Gmail is connected.
- Every migration so far has only ever run on development data. After the baseline squash (launch checklist, section 2), each schema change runs against production while the old version is still serving.
- Google OAuth, Cloud KMS, Pub/Sub, and Gmail push can't be fully exercised locally.
- Web and worker deploy as separate services, so nothing orders them: a new worker could start before its migration has run.
- Promoting to production must be a deliberate act, and possible from a phone.

## Decision

### Environments: dev, staging, production

| | Where | For | Data |
|---|---|---|---|
| **dev** | The builder's machine: `npm run dev` and local Supabase | Writing code, tests | Made-up |
| **staging** | Its own Render services and Supabase project | Rehearsing migrations; Google, KMS, Pub/Sub for real | The builder and test accounts only |
| **production** | Its own Render services and Supabase project (Pro) | Beta users | Customers' |

- Each deployed environment has its own Google Cloud project and OAuth client, KMS key, storage bucket, Pub/Sub topic and subscription, and `BETTER_AUTH_SECRET`. Nothing is shared between them.
- Staging's consent screen stays in Testing (up to 100 test users is enough); it never reads a customer's mailbox. The real-mail rule in `AGENTS.md` applies to staging as to production.
- Staging runs on Supabase's free plan; its idle pausing doesn't matter there.
- No shared, deployed dev environment and no per-pull-request previews (see Alternatives).

### Deploys: GitHub Actions, in a fixed order

```
merge to main → CI passes
  → staging: migrate → worker → web → smoke check

builder publishes a release tagged vX.Y.Z
  → production: migrate → worker → web → smoke check
```

- A workflow deploys each environment in that order: migrations first (including the queue's schema), then the worker, then the web service, then a smoke check that the web service answers `/api/health` with the deployed commit. A failed step stops the rest.
- Render's own auto-deploy is off for all four services; the workflow triggers each deploy through Render's API with the exact `commitId`, and waits for it to go live before the next.
- **Migrations run on Render, not in GitHub**: the worker service's pre-deploy command runs the migrations (`node dist/migrate.mjs`), then publishes the contract and quote templates (`node --conditions=react-server dist/publish-templates.mjs`, decision 0020). It runs on the new build, after it's built and before it goes live, reading `DATABASE_URL` from Render, so GitHub never holds it. If it fails, the deploy stops and the old worker and web keep running. The web service has no pre-deploy command; the workflow deploys it only after the worker is live.
- The same step first refuses to go on while the queue holds jobs the new version has no handler for (see "Old and new versions side by side").
- Not a Render one-off job: a job runs the service's last successful build, which is the old code, without the new migration files.
- Migrations run automatically, before new code. That's only safe because every schema change keeps the running version working (add before remove, rename in steps: launch checklist, section 2, and `docs/git-workflow.md`).
- The worker's heartbeat and lock release (decision 0014's notes) already allow the old and new worker to overlap during a deploy.
- Until Render's services exist, a repository variable (`RENDER_DEPLOYS`) keeps merges to `main` from deploying.

### Old and new versions side by side

Render deploys each service without downtime: it starts the new instance, moves traffic once it's healthy, and stops the old one 60 seconds later, after letting it finish (30 seconds for web, 5 minutes for the worker). For that minute both versions run, so each pair has to work across versions:

- **A page from the previous deploy and the new server**: each build carries its commit as Next's deployment id (`NEXT_DEPLOYMENT_ID`), so the browser reloads instead of calling Server Functions or loading assets that no longer exist.
- **The new schema and the old code**: migrations add before they remove (above).
- **The old worker and new jobs**: the old worker keeps taking jobs for that minute, and its strict payload schemas fail any shape they don't know, even one with an extra optional field. So **a shipped job's payload never changes**: a new shape is a new job name (`message.analyze.v2`), which the old worker never takes, since Graphile fetches only the names a worker handles. The old name is marked `@deprecated` and its handler removed in a later pull request, once its jobs have drained.
  - `lib/queue/payloads.json` records every shipped shape; a test holds each job name to it and says what to do instead.
  - The migration step refuses to deploy a version that would leave queued jobs without a handler, so removing one too soon stops the deploy rather than stranding its jobs.
  - The rule is in `AGENTS.md`, for coding agents.

### Promoting to production: a version tag

- Production deploys when the builder publishes a GitHub Release tagged `vX.Y.Z` (from the Releases page, which works in a phone's browser). Releases stay at `0.x.y` through beta.
- The release notes list the pull requests since the last release, so support can tell which version a problem started in.
- A tag ruleset lets only the builder create `v*` tags; coding agents never create or push them.
- The workflow refuses a tag whose commit isn't on `main` or hasn't deployed to staging successfully (GitHub's deployment records). The `production` environment accepts only `v*` tags, so only a release's run can read production's deploy key.
- Production is triggered by hand and carried out by the workflow: the builder decides what ships and when; the order, the checks, and waiting for each step aren't left to memory. With the checks and the ruleset, publishing the release is the approval; there is no second Approve step (reconfirmed 2026-10-21).

### Secrets: in Render, on each service that reads them

- Secrets are set on each Render service that reads them, declared in `render.yaml` as `sync: false`: Render asks for the value when the Blueprint is first applied, and later syncs leave it alone. A secret both services read (`DATABASE_URL`, `BETTER_AUTH_SECRET`, the model keys) is entered on each.
- Each environment's Render Environment Group, shared by web and worker, holds only settings that aren't secret, and `WORKER_SECRET`, which Render generates there.
- Not every secret in the group: Render doesn't allow `sync: false` in a group, and doesn't say whether a Blueprint sync keeps values added to a group by hand. A sync that emptied a secret would take the app down.
- GitHub holds only what deploying needs: a Render API key and the services' ids, in GitHub Environments (`staging`, `production`); the production one is readable only by a release's run.
- Credentials split by service where a decision already says so (KMS: encrypt-only on web, decrypt-only on the worker, decision 0016) go only on that service.

### CI additions

On top of what `ci.yml` already runs:

- **Migrations from empty**: a Postgres service container, and every migration applied to it in order, so a broken migration fails the pull request instead of a deploy. No test touches a database today.
- **Dependabot**: weekly update pull requests and security alerts for npm and GitHub Actions.
- **CodeQL** static analysis, and **secret scanning with push protection** (both built into GitHub).

None of these adds an npm dependency. CI also bundles the worker on every pull request (Implementation notes).

## Alternatives considered

- **Only dev and production.** Cheapest; every migration and every Google, KMS, or Pub/Sub setting would run for the first time on customers' data.
- **Per-pull-request previews.** Google OAuth doesn't accept wildcard redirect URIs, so sign-in wouldn't work in a preview, and each would need its own database (Supabase branching, paid). Worth it with more people and more pull requests, not now.
- **A shared deployed dev environment in front of staging.** For teams whose code can't all run on one machine; ours can.
- **Render deploying itself** (auto-deploy, staging following `main`, production a `production` branch). Least setup, but web and worker deploy independently, so the web service can go live before the worker's pre-deploy has migrated, and promoting means pushing a branch, which is awkward from a phone.
- **Manual approval in a GitHub Environment instead of a tag.** Works from GitHub's phone app, but leaves no version name for support to refer to; the tag gives both.
- **Both a tag and an approval.** Lets a release wait for a quiet hour; one more step every time, for one person who already decided by publishing. A setting on the `production` environment, should that change.
- **Deploying production by hand in Render's dashboard.** The decision stays with the builder either way; by hand, the order (worker before web), the commit, and the final check depend on memory.
- **Every secret in the environment group.** One entry per secret; see Secrets for why not.
- **Changing a job's payload in two deploys** (the worker learns the new field, then senders start sending it). No code, but a feature takes two deploys and nothing catches a forgotten step.
- **Stopping the old worker as soon as a newer one beats.** Narrows the overlap to the heartbeat's 30 seconds without closing it.
- **A central secrets manager (Doppler, Infisical) synced to Render and GitHub.** One place for every environment, with an audit trail and rotation; but another vendor holding every secret, for one person and under twenty secrets. The move later changes no code.
- **GCP Secret Manager.** Same cloud and IAM as KMS, but Render can't authenticate to GCP without a stored service-account key, which would live in Render anyway, and the app would need code to fetch secrets at startup.

## Consequences

- Cost: a second Render web and worker (about US$15–30 a month); staging's Supabase is free.
- Two of every external setup: Google projects, OAuth clients, KMS keys, buckets, Pub/Sub. The launch checklist's items apply to staging first.
- Whoever administers Render can read every secret; there's no audit trail of who read one. Revisit with a second person, compliance work (SOC 2), or more environments.
- A secret both services read is entered, and rotated, on each.
- A Render API key reaches everything the account can, in every workspace; it lives only in GitHub's environment secrets.
- A change to a job's payload is a new job name and, later, a cleanup pull request.
- Each schema change has to be written so the running version keeps working, since migrations run before the new code and with no one watching.
- Logging and error reporting: decision 0026.

## Implementation notes (2026-10-21)

Setup and day-to-day use are in `docs/setup/render.md`.

- `Dockerfile` builds in two stages; the image that runs has only production dependencies. The worker and the migration script run as JavaScript bundled by esbuild (`npm run build:worker`, `dist/worker.cjs`, `dist/migrate.mjs`, and `dist/publish-templates.mjs`), with plain `node`: the worker starts in 0.6 s instead of 1.3 s and idles at 139 MB instead of 206 MB.
- Migrations use drizzle-orm's migrator instead of drizzle-kit, so the image doesn't need dev dependencies; both record applied migrations in the same table, and a database built by each dumps to the identical schema.
- The worker's heap is capped at 384 MB of the starter plan's 512 MB. Memory-heavy jobs (analysis, bringing an email in: `heavyJobs`) run in a pool of their own, two at a time, beside the pool for the rest (four).
- Both services use Supabase's session-mode pooler, where each open connection holds a database connection. `render.md` budgets them (about 28 per environment); the pooler's pool size is checked against it before the first deploy.
- `scripts/render-deploy.mjs` carries out a deploy (called by `.github/workflows/deploy.yml`, from `ci.yml` for staging and `release.yml` for production). Render answers a deploy requested while another runs with no id; the script finds it by its commit.
