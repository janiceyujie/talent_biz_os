# Render

The app runs on Render in Singapore: per environment, a web service and a worker built from the one `Dockerfile`, defined in `render.yaml` ([decision 0014](../decisions/0014-hosting-and-job-queue.md)). This page sets them up; deploying is done by GitHub Actions, not by Render on its own.

| Environment | Web | Worker (private service) | Env group |
|---|---|---|---|
| staging | `taloox-web-staging` | `taloox-worker-staging` | `taloox-staging` |
| production | `taloox-web` | `taloox-worker` | `taloox-production` |

## Before you start

Each environment needs its own of each of these (launch checklist, sections 3 and 4); staging first:

- A Supabase project in Singapore. Use the **session-mode pooler** connection string (port 5432) for both services: the web service can't use transaction mode (6543) until `lib/db` turns off prepared statements.
- A Google Cloud project with an OAuth client ([google-sign-in.md](google-sign-in.md)), and a Pub/Sub topic and subscription ([gmail.md](gmail.md), "Push"). The worker refuses to start in production without Pub/Sub.
- An SMTP provider, a storage bucket and its keys, and Anthropic and OpenAI keys with spending caps.
- A new `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), never reused between environments: it encrypts stored Google tokens.
- A Cloud KMS key and two credentials for it ("Cloud KMS" below). The worker refuses to start in a deployed environment without them, as it does without Pub/Sub.
- A Sentry project, its DSN, and a token for source maps ([sentry.md](sentry.md)). One project serves both environments. The token goes on each web service as the secret file `sentry_auth_token`, the one setting `render.yaml` can't list.

## Cloud KMS

Each mailbox's refresh token is encrypted with its own data key, and the data key is wrapped by a master key that never leaves Cloud KMS ([decision 0016](../decisions/0016-mailbox-tokens-and-key-management.md)). The web service may only encrypt with it (when someone connects a mailbox); the worker may only decrypt (when it reads mail). Per environment, in the Google Cloud project that already holds the OAuth client and Pub/Sub:

```sh
P=<project>; L=asia-southeast1
gcloud kms keyrings create taloox --location $L --project $P
gcloud kms keys create mailbox-tokens --keyring taloox --location $L --purpose encryption --project $P

gcloud iam service-accounts create kms-web --project $P
gcloud iam service-accounts create kms-worker --project $P
gcloud kms keys add-iam-policy-binding mailbox-tokens --keyring taloox --location $L --project $P \
  --member serviceAccount:kms-web@$P.iam.gserviceaccount.com --role roles/cloudkms.cryptoKeyEncrypter
gcloud kms keys add-iam-policy-binding mailbox-tokens --keyring taloox --location $L --project $P \
  --member serviceAccount:kms-worker@$P.iam.gserviceaccount.com --role roles/cloudkms.cryptoKeyDecrypter

gcloud iam service-accounts keys create kms-web.json --iam-account kms-web@$P.iam.gserviceaccount.com
gcloud iam service-accounts keys create kms-worker.json --iam-account kms-worker@$P.iam.gserviceaccount.com
```

- On both Render services, `KMS_KEY` = `projects/$P/locations/asia-southeast1/keyRings/taloox/cryptoKeys/mailbox-tokens`.
- `GCP_KMS_CREDENTIALS`: the contents of `kms-web.json` on the web service, of `kms-worker.json` on the worker. Then delete both files from your machine.
- The roles are granted on the key alone, not the project: neither account can touch any other key.
- **Audit log**: Cloud KMS records decrypts only once Data Access logs are on (IAM & Admin → Audit Logs → Cloud Key Management Service → Data Read and Data Write). Turn them on, so every time the worker opens a token shows up.
- **Kill switch**: `gcloud kms keys versions disable 1 --key mailbox-tokens --keyring taloox --location $L --project $P` stops every mailbox at once; nothing can be decrypted until it's enabled again.
- Rotating the key (`gcloud kms keys versions create …`, or a rotation schedule) needs no change here: each wrapped data key carries the version that wrapped it.

## Creating the services

1. In Render, **New → Blueprint**, pick this repository, branch `main`. Render reads `render.yaml` and shows the project `taloox` with both environments.
2. Render asks for every `sync: false` value. Fill in staging's; for production, fill in only once its services above exist (or leave production out of the first sync).
   - `DATABASE_URL`: the session-mode pooler string, the same on web and worker.
   - `BETTER_AUTH_URL`: the web service's address, e.g. `https://taloox-web-staging.onrender.com` until a domain is set.
   - `SITE_PASSWORD` (staging's web service only): a password the team shares, e.g. from `openssl rand -base64 18`. Staging asks for it before anything else; any user name works ([decision 0027](../decisions/0027-staging-behind-a-password.md)). To change it, set a new value; the service restarts and everyone types the new one.
   - The rest as in `.env.example`.
3. Apply. Render builds the image and deploys each service once; the worker's pre-deploy command runs the migrations (`node dist/migrate.mjs`) and publishes the contract and quote templates (`node --conditions=react-server dist/publish-templates.mjs`) on that first deploy.
4. Check:
   - `https://<web address>/api/health` answers `{"ok":true}`, with no password.
   - Staging's address asks for the password, and the app opens after it.
   - The worker's logs show `worker.starting` with `"mode":"push"` and, if `WORKER_SECRET` reached it, `worker.http.listening`.
   - Sign in, and open Intake's Filtered out: senders and subjects show, so the web service reaches the worker.

## What the file decides

- **Nothing deploys on its own** (`autoDeployTrigger: off`): GitHub Actions deploys an exact commit, worker first, then web ("Deploys" below).
- **Migrations run in the worker's pre-deploy command**, on the new build, before it goes live. If one fails, the deploy stops and the old version keeps running.
- **The worker and migrations run as bundled JavaScript** (`dist/worker.cjs`, `dist/migrate.mjs`, `dist/publish-templates.mjs`, built by `npm run build:worker`), with plain `node`, not tsx; the image has only production dependencies. Locally, `npm run worker` and `npm run db:migrate` run the same code through tsx.
- **The worker's heap is capped at 384 MB** (`--max-old-space-size`) of the starter plan's 512 MB, so Node collects garbage before Render stops it for memory. Moving to a larger plan, raise both together.
- **Secrets are `sync: false`**: later Blueprint syncs leave their values alone. Change them in the dashboard, on each service that has them. `WORKER_SECRET` is generated by Render in each environment's group.
- **Networking isolation** keeps staging and production from reaching each other's private services; **protection** on production blocks destructive actions by anyone but workspace admins.
- **The worker gets 5 minutes to stop** (`maxShutdownDelaySeconds: 300`) so running jobs finish; a job that's cut off anyway is retried (decision 0014's notes).

## Deploys

| What | Goes to | Workflow |
|---|---|---|
| A commit on `main` that passes CI | staging | `ci.yml` → `deploy.yml` |
| A published release tagged `vX.Y.Z` | production | `release.yml` → `deploy.yml` |

Each deploy runs `scripts/render-deploy.mjs`: it deploys the commit to the worker and waits for it to go live (its pre-deploy step migrates first), then to the web service, then checks `/api/health` answers with that commit. A failure stops it there; whatever was live stays live. A release deploys only a commit that's on `main` and has already deployed to staging successfully.

**Releasing to production**: on GitHub, Releases → Draft a new release, a new tag `vX.Y.Z` on `main` (`0.x.y` through beta), Generate release notes, Publish. It works from a phone's browser. To release an earlier commit, pick it as the tag's target instead of `main`'s latest.

### Setting it up (once)

On GitHub, in the repository's settings:

1. **Environments**: create `staging` and `production`. In each:
   - Secret `RENDER_API_KEY`: a Render API key (Render: Account Settings → API Keys). A key reaches everything the account can, in every workspace; keep it only here.
   - Variables `RENDER_WORKER_SERVICE_ID` and `RENDER_WEB_SERVICE_ID` (each service's settings in Render, `srv-…`), and `WEB_URL` (the web service's address).
   - In `production` only, **Deployment branches and tags**: selected tags, `v*`. Only a release's run can read production's key.
2. **Rules → Rulesets**: a tag ruleset for `v*`, restricting creation, update, and deletion to the builder (bypass list: you only). Coding agents never create release tags.
3. **Variables** (repository level): `RENDER_DEPLOYS` = `on`, once staging's services exist. Until then merges to `main` deploy nothing.

Until then, deploy by hand in the same order: the worker (Manual Deploy → Deploy a specific commit), wait for it to be live, then the web service.

## Fixes and rollbacks

**A fix is a patch release.** Merge it to `main` as usual, let it reach staging, then release `v0.x.(y+1)` from `main`. `main` is always releasable (`docs/git-workflow.md`), so the release carries everything merged since the last one: read the generated release notes before publishing. There are no hotfix branches; if `main` often holds work that can't ship yet, hide it behind a flag rather than release from a branch.

**Something is broken in production right now: roll back first, fix after.**

1. In Render, open the service → Deploys → the last good deploy → Rollback. The web service if pages fail, the worker if jobs do, or both. A rollback reuses that deploy's build, so it skips building and is quick.
2. It's safe for the data: schema changes only add before they remove, so the earlier code runs on the newer schema.
3. Rolling back from the dashboard turns off the service's auto-deploy, which is off already; nothing to undo.
4. Then fix forward: a pull request, staging, and a new patch release, which deploys over the rollback.

Limits:

- Render keeps a limited number of recent builds per service (by workspace plan); older ones can't be rolled back to.
- Render doesn't say whether a rollback runs the pre-deploy step again. If it does, an earlier worker refuses while the queue holds jobs under a name only the newer version knows (a new `….v2`). Roll back the web service alone, or wait for those jobs to drain.

## Deploying without interrupting anyone

Render already deploys without downtime, for the web service and the worker alike: it starts the new instance, moves traffic to it once healthy (`/api/health`), and sends the old one `SIGTERM` 60 seconds later, waiting up to the shutdown delay before killing it. For a while the old and new versions run side by side, so each of these has to hold:

- **Browser and server**: a page from the previous deploy reloads instead of calling Server Functions that no longer exist. Each build carries the commit as `NEXT_DEPLOYMENT_ID` (Render passes `RENDER_GIT_COMMIT` to the Dockerfile).
- **Code and database**: migrations run before the new code, while the old still serves, so every schema change keeps the running version working: add before remove, rename in steps.
- **Old worker and new jobs**: for about a minute after the new worker is live, the old one still takes jobs, and its strict payload schemas fail any shape they don't know, even one with an extra optional field. So a job's payload never changes once shipped: a new shape is a new job name (`message.analyze.v2`), which the old worker never takes. `lib/queue/payloads.json` records every shipped shape and the tests hold each name to it; the old name's handler stays until its jobs drain, and the pre-deploy step refuses to deploy a version that would leave queued jobs without a handler.
- **Running work**: the web service finishes its requests within the default 30 seconds; the worker's running jobs within 5 minutes (`maxShutdownDelaySeconds`), and a job cut off is retried.

## Database connections

Through Supabase's session-mode pooler, every open connection holds one of the database's connections for as long as it's open, so the services' pools have to fit within the pooler's pool size (Supabase dashboard: Database Settings, "Connection pooling"). Per environment:

| Who | Connections | Set by |
|---|---|---|
| Web service (`lib/db`) | up to 10 | postgres.js default |
| Worker, the jobs' own queries (`lib/db`) | up to 10 | postgres.js default |
| Worker, the job queue (both pools) | up to 6 | `WORKER_PG_POOL` |
| Migrations (pre-deploy, while it runs) | 1–2 | |

That's up to about 28. Check the pool size is at least 30 before the first deploy, and raise it if not (Supabase advises at most 80% of the database's max connections). Running a second web instance or worker adds its share again.

## Adding a setting

A new non-secret setting shared by both services goes in the environment's group in `render.yaml`. A new secret goes under each service that reads it, as `sync: false`, then gets its value in the dashboard. Add it to `.env.example` too.
