# Existing-page portfolio verification

Date: 2026-10-12. Local branch: `user/timothy0324/local-integration`. No push or merge.

## Automated and local API checks

- Added selection persistence tests: explicit none, revoked ids, duplicate ids, invalid storage and date-specific links without scope leakage into unrelated pages.
- All 188 tests pass. Translation catalogs, ESLint, TypeScript, production build and diff whitespace check are checked for this batch.
- An isolated manager plus four fictional registered artists exercised `/api/manager/workspace`. All eight selections returned exactly the selected artists' calendar, finance and project summaries.
- Anonymous access returns 401; pending and cross-artist selectors return 403. Responses are private/no-store.
- Revoking A blocks its data immediately at the API; B remains readable. The fixture membership was restored solely for browser QA.

## Browser checks

- Original Today: selecting A/C shows A/C and removes the personal workspace create actions and preview banner.
- Original Calendar: A/C selection carries over; the existing week time grid and month grid show their records. Clicking an event opens viewing details; there are no create, drag, delete, archive or external export actions in this scope.
- Original Finance: A/C TWD actual received total is 3,600, using actual settled cash 900 + 2,700. Selecting B and USD shows only B's USD records and actual received 1,800. Different currencies are not added together.
- Changing artist selection retains the chosen finance currency and calendar date. The calendar opens at working hours after its hidden loading panel becomes visible, and later changes preserve scroll.
- Empty selection shows an explicit choose-artist message, not the personal workspace or all artists. Keyboard Space toggles an artist.
- Browser Back restored the earlier A/B selection after selecting A/B/C on another page. Refresh restored the selected roster.
- Responsive inspection at 320, 768, 1024 and 1440 shows no horizontal page overflow. Phone artist controls fit two chips per row. Phone finance dates stack to show complete YYYY/MM/DD input.

Screenshots are local artifacts under `portfolio-pages/`: Today and the existing large calendar. Temporary QA accounts are disposable; persistent Sample Artist workspaces and the original trial owner's records must remain intact.

## Known boundaries

Portfolio views are read-only and locally enabled. Other pages, search, assistant and notifications use My workspace. Intake/Projects aggregation and per-artist editing are a next batch. No subscription billing or external grant-calendar export is enabled.

## Final verification and cleanup

Final catalogs contain 2,226 matching keys and 74 registry labels. All 188 tests, lint, TypeScript, production build and whitespace checks passed. English portfolio copy and the personal-workspace return were exercised in the browser. A fresh final tab had no warning/error console entries; earlier development Fast Refresh reload warnings were not final-state failures.

The five isolated QA accounts/workspaces and their private credential fixture were removed after sign-out. Re-running the persistent manager sample seed preserved all original workspace rows and added no duplicates. User-visible Sample Artist workspaces remain available. Temporary browser tabs were closed and viewport overrides reset.
