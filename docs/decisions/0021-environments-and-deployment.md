# 0021 — Three environments, deploys driven by GitHub Actions, secrets kept in Render

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

- A workflow deploys each environment in that order: migrations first (`npm run db:migrate`, including the queue's schema), then the worker, then the web service, then a smoke check against the deployed address. A failed step stops the rest.
- Render's own auto-deploy is off for all four services; the workflow triggers each deploy through Render's API with the exact `commitId`, and waits for it to go live before the next.
- **Migrations run on Render, not in GitHub**: the worker service's pre-deploy command is `npm run db:migrate`. It runs on the new build, after it's built and before it goes live, reading `DATABASE_URL` from Render, so GitHub never holds it. If it fails, the deploy stops and the old worker and web keep running. The web service has no pre-deploy command; the workflow deploys it only after the worker is live.
- Not a Render one-off job: a job runs the service's last successful build, which is the old code, without the new migration files.
- Migrations run automatically, before new code. That's only safe because every schema change keeps the running version working (add before remove, rename in steps: launch checklist, section 2, and `docs/git-workflow.md`).
- The worker's heartbeat and lock release (decision 0014's notes) already allow the old and new worker to overlap during a deploy.

### Promoting to production: a version tag

- Production deploys when the builder publishes a GitHub Release tagged `vX.Y.Z` (from the Releases page, which works in a phone's browser). Releases stay at `0.x.y` through beta.
- The release notes list the pull requests since the last release, so support can tell which version a problem started in.
- A tag ruleset lets only the builder create `v*` tags; coding agents never create or push them.
- The workflow refuses a tag whose commit isn't on `main` or hasn't deployed to staging successfully. With that check and the ruleset, publishing the release is the approval; there is no second Approve step.

### Secrets: in Render, one copy per environment

- Each deployed environment has one Render Environment Group, shared by its web and worker services, holding every secret for that environment.
- GitHub holds only what deploying needs: a Render API key and the services' ids, in GitHub Environments (`staging`, `production`); the production one is readable only by the release workflow.
- Credentials split by service where a decision already says so (KMS: encrypt-only on web, decrypt-only on the worker, decision 0016) stay on that service rather than in the shared group.

### CI additions

On top of what `ci.yml` already runs:

- **Migrations from empty**: a Postgres service container, and every migration applied to it in order, so a broken migration fails the pull request instead of a deploy. No test touches a database today.
- **Dependabot**: weekly update pull requests and security alerts for npm and GitHub Actions.
- **CodeQL** static analysis, and **secret scanning with push protection** (both built into GitHub).

None of these adds an npm dependency.

## Alternatives considered

- **Only dev and production.** Cheapest; every migration and every Google, KMS, or Pub/Sub setting would run for the first time on customers' data.
- **Per-pull-request previews.** Google OAuth doesn't accept wildcard redirect URIs, so sign-in wouldn't work in a preview, and each would need its own database (Supabase branching, paid). Worth it with more people and more pull requests, not now.
- **A shared deployed dev environment in front of staging.** For teams whose code can't all run on one machine; ours can.
- **Render deploying itself** (auto-deploy, staging following `main`, production a `production` branch). Least setup, but web and worker deploy independently, so the web service can go live before the worker's pre-deploy has migrated, and promoting means pushing a branch, which is awkward from a phone.
- **Manual approval in a GitHub Environment instead of a tag.** Works from GitHub's phone app, but leaves no version name for support to refer to; the tag gives both.
- **A central secrets manager (Doppler, Infisical) synced to Render and GitHub.** One place for every environment, with an audit trail and rotation; but another vendor holding every secret, for one person and under twenty secrets. The move later changes no code.
- **GCP Secret Manager.** Same cloud and IAM as KMS, but Render can't authenticate to GCP without a stored service-account key, which would live in Render anyway, and the app would need code to fetch secrets at startup.

## Consequences

- Cost: a second Render web and worker (about US$15–30 a month); staging's Supabase is free.
- Two of every external setup: Google projects, OAuth clients, KMS keys, buckets, Pub/Sub. The launch checklist's items apply to staging first.
- Whoever administers Render can read every secret; there's no audit trail of who read one. Revisit with a second person, compliance work (SOC 2), or more environments.
- Each schema change has to be written so the running version keeps working, since migrations run before the new code and with no one watching.
- Logging and error reporting are still open (launch checklist, section 6).
