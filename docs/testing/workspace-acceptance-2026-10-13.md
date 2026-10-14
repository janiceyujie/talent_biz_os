# Workspace acceptance — 2026-10-13

Local-only on `user/timothy0324/local-integration`. Existing unrelated changes preserved. No paid AI, external mail/calendar calls, production changes, migration, commit, push or merge.

## Fixed in this pass

- Project pagination now binds its cursor to the owner or delegated manager scope, sorted artist selection, filters and ordering. A stale cursor cannot silently skip records after a filter/scope change. Sort-specific position and UUID validation rejects malformed cursors before PostgreSQL casts; both personal and manager endpoints return 400.
- Restoring a previously expanded project list stops on request failure and ignores a previous scope's page. This closes an automatic retry path that bypassed the ordinary load-more error guard.
- Existing cursors from before this change must restart from the first page via refresh/retry. Cursor fingerprints detect context mismatches, not authorization; every query still enforces workspace membership and plan access.

## Reproducible checks

Run from the repository root with the local dev server on port 3000:

```sh
npm run test
npm run i18n:check
NODE_OPTIONS=--conditions=react-server npx tsx scripts/check-pagination.mts
NODE_OPTIONS=--conditions=react-server npx tsx scripts/check-workspace-flows.mts
```

Both integration scripts refuse non-loopback databases. The HTTP suite also refuses a non-loopback server or a non-development environment. It resolves action IDs from the running Next.js dev manifest, creates isolated accounts/workspaces, and deletes only recorded fixture IDs in `finally`. Fixture credentials are held in memory and never logged. No real messages are used.

- 211 unit tests pass.
- 33 database checks pass: files/grants/projects, 20/20/5 paging, timestamp ties, complete counts, search beyond the first page, literal wildcard search, scope isolation, all four project sorts and stale cursor rejection.
- 112 HTTP/action assertions pass: all eight combinations of three artists; pending invitation denial; anonymous and cross-artist requests; mismatched project detail; immediate revocation with existing sessions; disabled manager entitlement; personal/delegated 20/20/5 project paging; search outside page one; actual grant save/edit/complete/reopen/link actions with PostgreSQL readback; cross-artist and manager mutation denial; repeated-save and repeated-task idempotency.
- Locale parity: 2,288 catalog keys and 74 registry labels. Targeted lint and isolated production build pass.

## Browser acceptance

- Grant discovery and Files each start with 20 rendered records, scroll to 40 and then 45, and reset to one result for a searched record outside the original first page.
- A grant is saved with typed date/time `2026-10-21 15:30`. Calendar shows that task. Editing the time there to `16:45` and following the application link returns to the same updated submission. Completing it changes both card and detail to the completed submission state.
- A delegated manager opens artist B's 45 projects. Switching to C replaces the list and detail with C's one project. Calendar, Finance and Today preserve C, show only C's records and keep editing controls unavailable. C's recorded TWD 3,000 payment is correctly summarized at its actual settled amount of TWD 2,700.
- Temporary browser accounts, their dependent records, and the 45 artificial grant announcements are removed after sign-out. The user's trial records remain.

## Boundaries and next batch

This is functional/security acceptance at modest fixture volume, not production load testing or exhaustive race-condition proof. The restoration error guard was reviewed in source; network failure during a 200-plus-row restoration was not browser-injected in this pass.

The shell still loads shared collections needed by current aggregates, calendars and pickers. Do not cut those collections to 20 and produce incomplete totals. Remaining scaling work is described in `list-pagination.md`: database aggregates, visible-range calendars, inbox summary/detail paging and server-side pickers.

Grant tasks synchronize inside Taloox; they are not Google Calendar events and saving a grant does not create a signed project automatically. Manager access remains the local, read-only entitlement pilot. Billing-backed plans and deployment remain separate.

Next: the Gmail ingestion vertical slice using labeled synthetic mail and explicit review decisions. Before a real mailbox pilot, replace the existing inbox 200-row cap with a paged summary/detail API and accurate counters; then verify authorization, import bounds, review/recovery and deduplication without calling a model unnecessarily.
