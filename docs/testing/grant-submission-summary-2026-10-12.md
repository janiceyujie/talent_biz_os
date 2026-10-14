# Grant planned-submission summary

Local only, 2026-10-12, branch `user/timothy0324/local-integration`.

## Change

Show a compact Planned submission row in saved announcement cards and above application progress fields. Read the existing grant-linked submission to-do; there is no new date column, migration, or duplicate persisted value. Keep official cutoff dates separate. The earliest unfinished submission takes priority, including overdue work; if all submissions are completed, retain the latest planned date under Submission task completed. Ignore report, budget, undated and dismissed tasks. Ordering compares actual instants across task time zones. The unset state opens the existing submission task form.

## Verification

- 180 tests passed, including three submission-summary regression cases. TypeScript, lint, i18n parity (2,117 keys), production build and diff checks passed.
- Used an isolated local test account to save an existing official opportunity. From the unset summary, entered `20261019` and `2300` and saved through the actual form. Cards and application detail both showed 2026-10-19 23:00. Returning to Grants preserved the stored date.
- Completing and reopening the task updated the summary and preserved its date. Application progress remained Preparing; no official-submission state was inferred.
- English and Traditional Chinese checked. Keyboard Enter opened the summary explanation. No console errors were captured.
- Checked widths 320, 768, 1024 and 1440 with no horizontal overflow; desktop and phone screenshots inspected. Viewport override reset.
- Existing user records were not changed. Test account signed out and removed after verification. No commit, push or deployment.
