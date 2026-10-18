# Gmail and local pilot integration verification

Local-only integration of main `b8e3e0a` and feature snapshot `d74e3e4` on `user/timothy0324/gmail-integration`. Selection and migration rationale: [decision 0023](../decisions/0023-gmail-integration.md).

## Checks

- Unit suite: 237 tests, 42 suites passed.
- Inbox/Gmail acceptance: 40 assertions passed using 205 messages and injected synthetic mail/queue providers. Covers owner-only import, workspace isolation, duplicates, retries, cancellation during content reading, revoked ownership and payment restrictions.
- Pagination acceptance: 33 assertions passed for projects, files and grants, including 20/20/5 pages, microsecond timestamp ties and query/tenant cursor validation.
- Workspace acceptance: 112 assertions passed. Covers all eight combinations of three selected artists, read-only separation, manager plan/invitation/revocation gates and actual grant save/edit/task completion/project-link actions.
- Authentication regression: 12 checks passed for missing, expired and invalid secure session cookies. Sign-in remains reachable; the protected inbox API still returns 401. Sign-in redirects only after server-side session verification, and its native fallback uses POST.
- TypeScript, ESLint, bilingual catalogs (2383 keys and 74 registry labels), and production webpack build passed.
- Main migrations 0000-0028 unchanged. Fresh canonical migration chain and main-to-0029 upgrade both passed against separate loopback databases; resulting public columns matched.
- Browser: synthetic account sign-in; Messages/Waiting/Filtered out tabs; Gmail 30-row page followed by 45 total rows; Not work updates 45/2 to 44/3; Restore updates back to 45/2. Missing worker metadata produces an explicit unavailable notice and disables import, rather than pretending to read Gmail.

## Boundaries

No real Gmail read, paid model call, GitHub push, main merge or deployment was performed. The original local database is retained. The new local database was populated through a private backup and compatible data transfer, not by rewriting applied migration records. Object-storage files are not moved.

The independent browser test server used its own auth secret and loopback hostname. Restarting after the production build with a clean development cache resolved test-only asset/request-context errors. The original auth secret is preserved in the normal checkout. A stale browser session now reaches sign-in instead of looping between sign-in and home.

## Follow-up

Real Gmail OAuth, worker metadata reads and model classification still require an explicitly configured end-to-end test. The embedding experiment remains inactive. The manager trial is scoped read-only access and is not a production billing/entitlement launch.

## Local activation

The normal checkout runs the integration on localhost:3000. Its DATABASE_URL points to `taloox_integrated_20261013` on the existing local PostgreSQL instance. All 38 original public application tables matched by row count and content hash after cleanup of test fixtures and refresh of the latest grant catalog. The original `postgres` database remains available as a rollback copy. The old worker had eight exhausted grant-refresh jobs and no unfinished active jobs; those failed-job records remain in the old database rather than being requeued.
