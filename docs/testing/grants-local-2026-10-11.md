# Local grants validation

Date: 2026-10-11, America/New_York. Branch: `user/timothy0324/local-integration`. No commit, push, PR, deployment or production database change.

## Automated checks

- 166 tests passed, 31 suites. Grant regression cases cover ROC fiscal-year/date separation, malformed markup, unexpected URLs, stable ids and hashes despite rotating view-state, forecast/unknown deadlines, stale entries and local-only environment gates.
- Lint, TypeScript and translations passed (2066 matching catalog keys, 74 registry labels).
- Production build passed; the grant experiment stays unavailable in production.
- Generated/applied additive migration `0027_rich_nuke.sql` to the loopback database. Existing migrations were not changed.

## Real local actions with an isolated test identity

Created a disposable verified test identity and separate talent workspace; no credentials or customer records were transmitted externally. Exercised the actual localhost sign-in and Next Server Actions:

- Duplicate save creates one application.
- Cross-workspace application mutation and task creation are refused.
- Cross-workspace and unsigned project links are refused.
- Retried task creation stores one task using its request id.
- Award status creates no payment or revenue entry.
- Region-specific watch alerts appear on Today; acknowledgement clears them.

## Browser verification

- Chinese discovery, saving, progress editing, signed-project link and task creation.
- My applications filter and Escape cancellation with focus return.
- Completing a task and opening Calendar shows its stored deadline in the existing calendar; source and date are retained.
- From Grants, links to stored Calendar/Project/Finance records leave sample mode, preventing preview collections from hiding the real tasks.
- English language switch, U.S. source filter and keyword search.
- Phone viewport: no horizontal overflow, readable details and available close control. Viewport override reset after testing.
- Existing signed-in Chrome workspace was used only for browsing the new public announcement screen; application write tests used the separate disposable workspace.

## Current limits

Coverage is five home-page news items from MOC and the Grants.gov Arts-category posted/forecast list, not all Taiwanese/U.S./state grants. No automatic eligibility decision, application submission, report due-date inference, document download or outbound alert delivery. Official grant dates and applicant qualifications require reviewing the program's source. Refresh runs only while the local worker is running.
