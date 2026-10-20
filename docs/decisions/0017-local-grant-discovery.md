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

Local-only `grants.refresh` uses the existing worker once daily at 00:00 UTC when explicitly enabled (revised after the October 18 product review); manual refresh remains available. Shared cache avoids one external fetch per user or page visit. A source-scoped advisory lock serializes requests across processes. Manual refresh bypasses the cooldown; callers arriving during an update reuse its completed result. Scheduled/retry calls retain a 15-minute cooldown. Successful and failed completion timestamps are stored so repeated manual requests are not silently ignored. Fetches have HTTPS validation, fixed allowlisted endpoints, no redirects, timeout, stream-size cap and a 1,000-record limit. No browser-provided URL is fetched. No grant applications are submitted and no user data is sent to sources.

Absent entries in a limited feed are retained, not treated as withdrawn. Older-than-24-hour entries require checking official status. Changed title/status/dates can notify subscribers. A known opening date can also trigger a date-based reminder; exact opening/cutoff times remain subject to the official source. Taiwan dates use Asia/Taipei; U.S. date reminders use the workspace zone, without claiming the official deadline's exact zone. Acknowledgement clears currently known changes. No email/push notification or Codex automation is created.

## Local boundary and rollout

`GRANTS_LOCAL_ENABLED=1` requires development, non-production NODE_ENV and a loopback database. `GRANTS_SYNC_ENABLED=1` additionally enables worker cron. The defaults in `.env.example` are off. The navigation and route are hidden/disabled in production. Local `.env.local` is ignored and retained; it contains no committed credentials.

Before a future deployment: review jurisdiction/source coverage, official feed licensing and rate limits, monitoring, pagination, timezone details, user eligibility UX, tenant access and migration order with the repository owner. Replace the local experiment gate only through an explicitly reviewed change. Production notification delivery and full guideline/attachment ingestion are not implemented here.

## Opportunity exploration extension — October 20, 2026

The navigation label is now **Opportunities**. The existing `/grants` route and application deep links remain valid. Grants and competitions/exhibitions/showcases have separate discovery tabs and one shared Following tab, application editor, tasks and Calendar flow. This is discovery/preparation, not an application submission service or a marketplace transaction engine.

The published migration `0040_handy_dust` (original local lineage: `0037_cynical_changeling`) only adds `grant_opportunity.kind` (existing records default to grant), nullable reviewed `eligibility` JSON, an index and a kind constraint. No existing record or column is deleted. Shared public facts remain separate from talent-scoped application data. Applicant screening settings use the existing `preference` table with key `opportunities.profile`, scoped to both person and talent; role and manager permissions are not changed.

Screening compares only explicit applicant-type and country rules. Source country is never applicant nationality/residency. The UI distinguishes known criteria match, needs review and known mismatch, and always links to evidence. Missing profile fields, unknown/expired evidence, ambiguous categories and additional eligibility prose remain unconfirmed. Screening does not prevent following or submitting an opportunity and is never approval of complete legal eligibility. The default includes every eligibility status. Filtering happens in PostgreSQL before the 20-record limit; cursor identity includes filters and the authenticated person's current profile.

Grants.gov detail enrichment uses the documented, unauthenticated `https://api.grants.gov/v1/api/fetchOpportunity` API. Only official returned IDs are sent. No applicant data or AI is used. Each refresh reads at most 30 details, at most 3 concurrently, within a 20-second detail budget and a 10-second per-request timeout, reusing the existing response size bound. Listing retrieval survives a detail failure. Known official applicant category codes can support preliminary comparisons; unknown/Other codes, ambiguous types or qualifying prose preserve the official excerpt but do not infer exclusions. Evidence dates expire; date-only rechecks do not create content-change notices. The MOC news adapter has no normalized eligibility source, so its records remain needs-review rather than being classified from titles.

`lib/grants/reviewed-catalogue.ts` contains reviewed official snapshots for SXSW, ISC, Creative Expo Taiwan monitoring, and one historical NEA cycle. `scripts/import-reviewed-opportunities.mts` validates and imports them only into an explicitly checked loopback development database. Reimporting does not advance review dates or change applications. The Creative Expo entry explicitly monitors a future call; it does not claim that the next application is open. The historical NEA deadline remains in the past and is hidden by the default active filter. Competition/exhibition sources are not automatically crawled yet; this limit is shown in the UI.

`worker:grants` runs a local grant-only worker for development without consuming Gmail, AI, invoice or send jobs. It uses the same `GRANT_REFRESH_CRON` as the normal worker (`0 0 * * *`, UTC). The worker and database must be running and the Mac awake. This is not an OS startup service, a cloud deployment or a guarantee of execution during sleep/offline time. Manual refresh runs through the authenticated web action immediately, bypassing scheduled cooldown; concurrent callers share an update that finishes after their request began. Both sources' last successful local timestamps are visible. A failed source preserves previous listings and returns a retryable message.
