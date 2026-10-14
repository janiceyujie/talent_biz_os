# Database-backed list pagination

Local implementation, October 2026. No production migration, push, or external API call is required.

## Implemented boundaries

- Personal and delegated manager project lists: cursors are bound to the authenticated scope, artist selection, filters and sort; invalid or mismatched cursors return 400. First page and subsequent scrolling pages use 20 records. Existing larger restoration requests remain available when returning to an already-expanded list. Deduplicate updated records and abort superseded filter requests; an error requires explicit retry.
- File archive and project-related files: workspace-scoped `/api/files` selects 20 records plus one look-ahead row, filtered and ordered in PostgreSQL. The shared app layout no longer selects the entire file archive. File binaries still use the existing authorized download endpoint.
- Grant discovery and the saved-grant list: `/api/grants` filters/searches/counts in PostgreSQL, then returns 20 records plus a cursor. Public national feeds are no longer preloaded into the workspace. Existing saved applications, their opportunities and tasks remain in the grant workspace for editing and calendar deep links.
- Load-more controls remain keyboard-accessible, even when automatic intersection loading is unavailable. A failed request does not start a retry loop. New filters immediately remove stale results and cancel previous requests.

## Deliberate remaining work

This is not a complete replacement of `getAppData`. The shell still reads project summaries, payments, events, to-dos, contacts, reply templates, contract versions. Inbox bodies have since moved to paginated summary/detail reads; see decision 0022. The saved-grant editing context also grows with the number of applications.

Do not silently cap these at 20: overview totals, finance calculations, notifications, intake matching, calendar display, and dropdowns currently depend on complete collections. Follow decision 0011 in separate steps: database aggregates for overview/finance, visible-range calendar queries, server-side search/pickers, and an inbox summary/detail split with authoritative counters. The inbox 200-row cap was replaced in the subsequent acceptance pass; see `docs/testing/inbox-mail-acceptance-2026-10-13.md`.

The bounded published document-template catalog is not an unbounded activity feed, so it retains its existing on-demand library request.

## Verification

Run `npm run test`, `npm run i18n:check`, and `NODE_OPTIONS=--conditions=react-server npx tsx scripts/check-pagination.mts` from the repository root. The latter refuses non-loopback databases, creates isolated temporary workspaces/files/grants and removes only their recorded IDs in `finally`; it does not write object-storage files or call AI.

Database checks cover 45 records as 20/20/5, identical microsecond timestamps, unique IDs, complete counts, server-side search, literal wildcard characters, archive/project/region filters, malformed and cross-workspace cursors, saved-application isolation, SQL/UI grant availability parity, and 20-row project pages.

Browser checks use disposable local accounts: scroll files and grants, search a record outside the first page, open and save a grant, confirm the application detail survives revalidation, and check retry behavior. No sample records should be left in the user's workspace.

Keyset ordering uses timestamp + ID for files, and availability priority + deadline + ID for grants. Grant cursor chains freeze the clock used for availability classification. Concurrent edits can move records; duplicate IDs are merged, and refresh starts a fresh chain. This is not a historical snapshot or a complete audit export.
