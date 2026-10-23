# 0026 — Logging and error reporting: structured logs on Render, errors to Sentry

**Status:** Accepted (2026-10-21)

## Context

Nothing is logged on purpose yet: about 27 scattered `console.error` calls, read by nobody. Once beta users are on production (decision 0025), support has to answer "why didn't my email come in on Tuesday", and the builder has to hear about failures before a customer does.

Much of what support needs is already in the database, and kept longer than any log: `audit_log` (who confirmed or changed what), `ai_call` (every model call, its outcome and latency), and Graphile Worker's jobs (what failed and its last error). Logs fill the gap between those: requests, jobs, and calls to Google and other services.

The forces:

- One builder, in beta; little time to run tooling, and no one watching a dashboard.
- Message content is customers' mail. It must not leak into logs or an error tracker (decision 0007, and `AGENTS.md` on real mail).
- Render keeps logs 7 days on its Hobby workspace plan, 14 on Pro, 30 on Scale; text and regex search; at most 6,000 lines a minute per instance (more are dropped); logs can be streamed out over syslog or HTTPS.

## Decision

- **Logs: JSON lines on stdout, kept by Render.** Web and worker write one JSON object per line through a small module of our own (`lib/log`), not a vendor SDK, so where logs go is configuration, not code.
- **Errors: Sentry** (`@sentry/nextjs`), on web and worker, in staging and production. Each event carries the environment, the release (`vX.Y.Z`, decision 0025), and the talent and person ids, never names or message content. Errors are reported through one module of ours (`lib/errors`), so a change of tracker is one file.
- **Scrubbing before anything leaves**: Sentry's `beforeSend` drops request bodies, cookies, and headers, and the fields that can carry message content; its default PII collection stays off. A test sends an error built from a message and checks that none of its text reaches the event.
- **Alerts** reach the builder by email and as a push on their phone (Sentry's Slack integration, to a channel the builder gets notifications from in Slack's app): a new issue, an issue that comes back after being resolved, and a spike.
- The privacy policy names Sentry, and its data region (US or EU), as a processor.

### What a log line holds: an allowlist

`lib/log` takes an event name and fields whose types allow only ids, codes, statuses, counts, and durations. Anything else fails the type check, so content can't reach a log by accident.

```json
{"ts":"…","level":"error","service":"worker","env":"production","release":"v0.0.3",
 "event":"mail.sync.failed","job":"mail.sync","job_id":"…","attempt":2,
 "talent_id":"…","connection_id":"…","duration_ms":812,
 "error":{"name":"GmailError","status":429,"code":"rateLimitExceeded"}}
```

- **Every line**: `ts`, `level`, `service` (`web` or `worker`), `env`, `release`, `event` (dotted, `<area>.<what>`, e.g. `mail.sync.failed`).
- **Logged**: each job's start and end (outcome, duration, attempt); each server action and API route (`request_id`, route pattern, status, duration); failed calls to Google; sign-in and connection outcomes. A model call logs only its `ai_call` id; the details are already in that table.
- **Never logged**: message bodies, subjects, senders, email addresses, attachment names; prompts and model output; tokens, cookies, `Authorization` headers; full URLs with query strings (OAuth codes travel there); raw error objects from libraries or other services, whose messages can echo content (a Google error quoting an event title, a schema error quoting model output).
- **Errors** are reduced to `name`, `code`, and HTTP `status`. `lib/errors` applies the same reduction before Sentry, keeping the stack trace.
- **A failed sign-in** logs the `person_id` when the account exists and only the reason when it doesn't; never the email address typed.
- **Levels**: `error` needs attention and also goes to Sentry; `warn` was handled but isn't normal; `info` is one line per request or job; `debug` is off in production.
- When debugging needs the content, the line's ids (`message_id`, `connection_id`) lead to it in the database, behind the app's access rules.
- The existing `console.error` calls move to `lib/log`; two of them print raw errors today (`lib/ai/analyze-message.ts`, `lib/calendar/google/sync.ts`).

### How support finds an account's trail: a staff-only Support page

Built before the first beta user besides the builder.

- **Lookup by email** opens the account: its talents, Gmail and Google Calendar connection status, and the last successful sync of each.
- **One timeline** merges `audit_log`, `ai_call`, failed jobs, and recent messages, showing ids, statuses, error codes, and times; never message content, the same rule as logs.
- **Links out** from each entry: Render's log search filtered to the `talent_id` and time range, and Sentry filtered to the same talent.
- **Error codes for customers**: error screens show the first 8 characters of the `request_id` (in both message catalogs). Pasted into the Support page, it finds that request's log lines and Sentry event.
- **Every lookup is audited**: a `support.viewed` row in the viewed talent's `audit_log`, so the account's own history shows when support looked.
- **Who is staff**: a `staff` table, kept apart from `person` (Better Auth's user table, whose fields can reach the session):

  ```
  staff
    person_id   references person, primary key
    role        'support' | 'admin'
    granted_at
    revoked_at  null while the access holds
    note        why it was granted
  ```

  Granted and revoked only by SQL, with no screen in the app, so no bug in the app can grant it. Revoking sets `revoked_at` and keeps the row, so who had access when stays on record. Only `support` is used at first, and it can only read the Support page; what `admin` may do is decided when it's needed.

### Implementation notes

Logs (`user/janlin/structured-logs`):

- `lib/log` checks values as well as types: an id field must look like an id and a code field like a code, or the value is written as `[invalid]`; a field outside the allowlist is dropped. So a cast can't get content through either.
- `env` is `DEPLOY_ENV` (`staging` or `production`, from each environment's group in `render.yaml`). `release` is the deployed commit (`RENDER_GIT_COMMIT`, first 12 characters): staging deploys commits, not tags, and a tag names a commit.
- Graphile Worker's own messages go through `lib/log` too (`worker/queue-log.ts`): its line for a failed job quotes the error's message and stack, so only the error's name and code are kept, and its progress messages are dropped.
- Jobs log `job.started`, `job.succeeded`, `job.will_retry` (warn), and `job.failed` (error, the last attempt), with the payload's ids.
- A worker that refuses to start prints the reason, a setting's name, before any job has run.
- ESLint's `no-console` keeps `console.*` out of server code.
- One line per request, with its `request_id`, comes with the error codes on error screens: request ids aren't in the app yet.

Errors (`user/janlin/error-reporting`):

- `lib/errors` sets up Sentry for the web server (`instrumentation.ts`, with Next's `onRequestError`), the browser (`instrumentation-client.ts`, and the screens' error boundary), and the worker (`@sentry/node`, from the same Sentry release line as `@sentry/nextjs`). Each `log.error` line is reported with its event name and ids, so "`error` also goes to Sentry" needs no second call.
- Scrubbing is an allowlist, not a list of things to remove: `beforeSend` builds a new event from the parts known to be safe (exception types and stack frames, the route, ids, the machine's context), and each exception's message becomes its name, code, and status. Breadcrumbs, the request, the user, extra data, tracing, and frames' local variables and lines of source are dropped. The test runs the real SDK and checks made-up content never reaches what it would send.
- Browser errors are reported too: only the browser sees a broken button or a client component that throws. Breadcrumbs (clicks, console output, URLs) and session replay stay off there.
- Source maps: the deployed build uploads the browser's and the server's to Sentry, then deletes every map, so none is served or shipped. The token is a Render secret file mounted for the build step only, so no image layer holds it. A failed upload doesn't fail the build. The worker isn't minified and keeps its own maps.
- The source maps uploaded include our source code, so Sentry shows the lines around an error. That's our code, never customers' data; leaving it out would leave file names and line numbers only.
- `release` is the deployed commit, as on log lines. A change of tracker touches `lib/errors`, `worker/errors.ts`, the `next.config.ts` wrapper, and the `Dockerfile`'s upload step.
- Setup and alerts: `docs/setup/sentry.md`.

Request ids and error codes (`user/janlin/request-ids`):

- **A request's id is its trace id.** Next starts a trace for each request, and the Sentry SDK carries it through everything the request runs, with or without a DSN. Every log line written during a request gets it as `request_id`, with no change where code logs, and Sentry's events carry the same id. The worker has no requests; its lines have `job_id`.
- **No line for a successful request; one for a failed one.** Next has no hook after a response is sent: `proxy.ts` runs before, and Next's trace spans hold a status and duration only when Sentry records every trace. Wrapping each route handler and server action (about 100) would work, at the cost of every new one remembering to. Instead `request.failed` (from `onRequestError`) records the route pattern, method, kind, digest, `rndr_id`, and the error, and is reported to Sentry. A line for every request is what Render's HTTP request logs give, on a Pro workspace (since April 2026 a flat $25 a month): each request has an id there, sent to the app as the `Rndr-Id` header, and `request.failed` keeps it as `rndr_id` so the two meet.
- **Error codes show Next's digest, not the request id.** A server error reaches the browser only as its digest, a hash of the error's message and stack: the same bug gives the same digest each time. Support finds the occurrence by the digest with the person and the time, in `request.failed`, which leads to its `request_id` and so to every line of that request and its Sentry event. An error thrown in the browser gets a random 8-character code, tagged on its Sentry event; without Sentry it shows none. A unique code per occurrence would need a second Sentry event for each server error.
- `app/global-error.tsx` covers a failure of the root layout itself. With no session there, its language is the language switch's cookie, then the browser's; it loads the catalogs only when it shows.
- `lib/log`'s hooks (the reporter and the request context) are kept on `globalThis`: Next loads a module once for `instrumentation.ts` and again for routes and pages, so a module variable set at startup didn't reach them. Before this, a `log.error` in a route or page wasn't reported to Sentry.

Support page (`user/janlin/support-page`):

- **Where and who.** `/support` in the same app. `requireStaff` (`lib/auth/staff.ts`) answers anyone without an unrevoked `staff` row with a 404, and every read in `lib/support` calls it, not only the page, so revoking takes effect on the next read. `lib/support` is the only code that reads across accounts. Each read takes only the columns in `lib/support/columns.ts`, and a test fails when a column is added there until it's approved in the test too. Staff are granted and revoked by SQL (`docs/setup/support.md`).
- **What it shows.** The account, its workspaces, Gmail and Google Calendar connections (status, failure code, last sync), and a timeline of the latest 50 of each: changes from `audit_log` (action and target, not `details`), AI calls, each email's relevance decision, messages (channel, status, failure code; never sender, recipients, subject, or body), and jobs that gave up (name, attempts, payload ids; never Graphile's error text). The connected mailbox's address is shown: it's the person's own, and support needs to check it's the one they meant.
- **Error codes and people link out.** `request.failed` lives in Render's logs and errors in Sentry, not the database, so the page links to them with the code or person id, and a copy button. Render's log search isn't documented to take a query in its address, so its link opens the service's logs. Calling Render's API instead would need a key that can deploy and delete services; copying failures into a table would mean writing to the database when it may be what failed.
- **Whose request.** `lib/auth` notes the person and talent once it knows them (`noteRequestIds`), so the rest of a request's log lines, its `request.failed`, and its Sentry events carry `person_id` and `talent_id`.
- **Each look is recorded**: a `support.viewed` row in each of the account's workspaces, with the staff member as actor, once per staff member per account per 30 minutes, so reloading the page isn't another look. The timeline leaves these out, so they can't crowd out what the person did; the account's card sums them up (the latest, by whom, how many in 30 days).
- **Its own wording**: `messages/support/`, loaded only by its pages, since the app's catalog reaches every person's browser.
- **Out of scope here**: managing the beta allowlist from this page (decision 0028), next.

#### Moving the Support page later

**Two-step sign-in for staff (when someone other than the builder becomes staff):**

1. Add Better Auth's two-factor plugin (its tables come with a migration) and a screen to enrol an authenticator app.
2. `requireStaff` also requires this session to have passed the second step, and sends staff who haven't to it.
3. Enrol the existing staff, then turn the requirement on. The Support page itself doesn't change.

**A service of its own (when there's a support team, a customer or audit asks for isolation such as SOC 2, or access should be limited to an office network or VPN):**

1. Deploy the same code as a second Render service that serves only `/support`, and turn `/support` off in the main app.
2. Give it its own domain (`support.<domain>`) and its own session cookie.
3. Give it a database role that can read only the tables and columns in `lib/support/columns.ts`, so even a bug can't read mail.
4. Add an IP allowlist or single sign-on as needed.

## Alternatives considered

- **Render's logs alone.** Free and no dependency, but nothing tells the builder something broke; customers would.
- **Free-form log lines with redaction afterwards.** Quickest to write, but a redaction list only catches the shapes someone thought of; both raw-error calls above would pass it.
- **Logging content, encrypted or kept briefly.** Easiest debugging, but a second copy of customers' mail outside the database, against decision 0007.
- **Also stream logs to a log platform now** (Better Stack, Axiom, Grafana Cloud). Longer retention and search by field; another vendor holding logs, for a volume that doesn't need it yet. Planned as the next step, below.
- **A full observability platform** (Datadog, New Relic). Logs, errors, traces, and dashboards in one; costly, and heavy to set up for one person.
- **Support through Supabase's SQL editor and a runbook of queries.** No code, but it shows every column including mail, records nothing about who looked, needs production database access (which decision 0025 keeps in Render only), and is unusable from a phone.
- **An internal-tool builder (Retool and the like) on the database.** Another vendor with production database access.
- **Signing in as the customer (impersonation).** Shows exactly what they see, including all their mail; needs their consent and its own audit design. A separate decision if it's ever needed.
- **A `staff` boolean or role column on `person`.** Simpler, but on Better Auth's table, and no history of who had access when.

## Moving on later

Logs and errors go through our own modules, with stable field names, so each step below is mostly configuration.

**To a log platform (when support questions often reach back past Render's retention, or logs need searching by field):**

1. Pick the platform, with a region near Singapore if it has one, and a retention of at least 30 days.
2. Add a Render log stream (syslog or HTTPS) for each environment; no code changes, since logs are already JSON on stdout.
3. Map the fields the platform should index (`talent_id`, `person_id`, `request_id`, `job_id`, `release`) and save the searches support uses.
4. Move log-based alerts (e.g. Gmail sync failing for every mailbox) to the platform; Sentry keeps errors.
5. Name the platform in the privacy policy; check its scrubbing matches ours.
6. Tell Render to keep the stream for both services, and check nothing is dropped at the 6,000-lines-a-minute limit.

**To a full observability platform (when there's a team on call, or performance needs tracing across web, worker, and Google):**

1. Add OpenTelemetry tracing (Next.js's `instrumentation.ts`; spans in the worker around each job), exporting over OTLP, so the vendor stays swappable.
2. Carry one trace id from the web request into the jobs it queues (an id, so it fits "jobs carry ids, never content"), and put it on every log line.
3. Point the log stream and the OTLP exporter at the platform; decide whether it replaces Sentry. If it does, only `lib/errors` changes.
4. Build the dashboards and on-call alerts there; retire the ones they replace.
5. Revisit cost per host and per log volume, the data region, and the privacy policy.

## Consequences

- New dependencies: `@sentry/nextjs`, and `@sentry/node` for the worker (which `@sentry/nextjs` already installs). A free Sentry plan covers one person in beta; watch its event quota.
- Every new error report and log field is a place message content could leak; the scrubbing test is the guard, and reviews should check new fields against it.
- Until a log platform is added, a support question about something older than Render's retention is answered from the database or not at all.
