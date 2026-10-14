# Local grant discovery and application tracking

Status: local experiment, 2026-10-11 (America/New_York). Not deployed or pushed.

## Decision

Add Grants under Workspace, with Find grants and My applications. Discovery is independent of the signed-deal workflow. Saving an opportunity creates an application, never a signed project, quote, contract, payment or received income.

Use the existing PostgreSQL, Drizzle migrations, Better Auth workspace authorization, Graphile Worker, Calendar/Today to-dos, Modal and InfoHint. No new dependency or AI call is required. The existing signed-project rule is unchanged: applications can remain independent, and can link only to signed work. Linking reconciles that application's existing tasks onto the same project; it does not change the project's stage.

## Records and access

- `grant_source`: shared public-source fetch status and last successful check. Failed checks retain the old cache.
- `grant_opportunity`: public title, agency, official URL, source region, explicit opening/closing dates, source status, content hash and check/change timestamps. Unique source/external id prevents duplicates. This contains no customer data.
- `grant_application`: talent-scoped preparation/submission/award/closeout status, project link and notes. Unique talent/opportunity.
- `grant_task`: the application link to an existing `todo`; no parallel calendar or reminder system. Request ids make repeated submissions idempotent.
- `grant_watch`: per-person, per-talent selected source regions, enablement and acknowledgement timestamp.

Every application read/write checks authenticated workspace ownership. Todo reads and writes also constrain `talent_id`; linked projects must belong to the same workspace. New tables follow existing RLS-enabled/server-access conventions. Migration 0027 is additive; prior migrations are unchanged. Public cache data is loaded only on Grants, not in every AppData payload; other pages receive only availability and the small notification count.

Source updates do not overwrite user task dates. A confirmed award status never creates finance entries. Grant reminders are planning tasks, not submission receipts or evidence of payment. Existing document storage remains unchanged: project files use the existing storage layer; this feature stores no binary documents in PostgreSQL.

## Sources and coverage

Verified official sources:

- Taiwan Ministry of Culture latest-news home page: https://grants.moc.gov.tw/Web/. Adapter covers the five news items presently exposed there, not all Taiwanese grants. Parse only explicitly stated ROC application date ranges, keeping the next fiscal year separate. Retain official links; opaque view-state rotation is not a content update. Missing structure fails visibly.
- U.S. Grants.gov: https://www.grants.gov/api/common/search2. Public `POST https://api.grants.gov/v1/api/search2` requires no authentication. Search the Arts category (`AR`) for posted/forecast opportunities, with bounded pagination. Source-provided classifications can be broad. Funding-source country is not applicant residency or a suitability recommendation. Distant placeholder deadlines become unknown, not invented closing dates. Official details: https://www.grants.gov/api/common/fetchopportunity.

Source data stays in its original language; navigation, controls, help and errors have both English and Traditional Chinese catalogs. Do not infer applicant eligibility from the account's creative role. For example, NEA Grants for Arts Projects excludes individual and for-profit applicants: https://www.arts.gov/grants/grants-for-arts-projects. Applicants must check the actual program, legal entity and jurisdiction; general receipt/report task suggestions are not universal compliance requirements.

Current first import: 5 MOC and 22 Grants.gov listings, 27 total. This is initial limited coverage, not an exhaustive grant directory. A date shown on a source page may differ from the user's current date in another time zone.

## Refresh and reminders

Local-only `grants.refresh` uses the existing worker every six hours when explicitly enabled. Shared cache avoids one external fetch per user or page visit. A source-scoped advisory lock and 15-minute minimum attempt interval serialize manual requests, cron and retries. Fetches have HTTPS validation, fixed allowlisted endpoints, no redirects, timeout, stream-size cap and a 1,000-record limit. No browser-provided URL is fetched. No grant applications are submitted and no user data is sent to sources.

Absent entries in a limited feed are retained, not treated as withdrawn. Older-than-24-hour entries require checking official status. Changed title/status/dates can notify subscribers. A known opening date can also trigger a date-based reminder; exact opening/cutoff times remain subject to the official source. Taiwan dates use Asia/Taipei; U.S. date reminders use the workspace zone, without claiming the official deadline's exact zone. Acknowledgement clears currently known changes. No email/push notification or Codex automation is created.

## Local boundary and rollout

`GRANTS_LOCAL_ENABLED=1` requires development, non-production NODE_ENV and a loopback database. `GRANTS_SYNC_ENABLED=1` additionally enables worker cron. The defaults in `.env.example` are off. The navigation and route are hidden/disabled in production. Local `.env.local` is ignored and retained; it contains no committed credentials.

Before a future deployment: review jurisdiction/source coverage, official feed licensing and rate limits, monitoring, pagination, timezone details, user eligibility UX, tenant access and migration order with the repository owner. Replace the local experiment gate only through an explicitly reviewed change. Production notification delivery and full guideline/attachment ingestion are not implemented here.
