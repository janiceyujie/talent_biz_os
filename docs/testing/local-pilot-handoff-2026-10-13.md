# Local pilot review handoff — 2026-10-13

> Historical snapshot: Gmail runtime and migration instructions are superseded by [decision 0023](../decisions/0023-gmail-integration.md).

**Review snapshot only. Do not merge or deploy this branch as-is.**

## Branch and integration boundary

- Review branch: `user/timothy0324/local-integration`.
- Integrated main base: `2a981de` (Gmail connection and background analysis worker).
- Latest main inspected on October 13: `b8e3e0a` (PRs #9 and #10).
- This snapshot does **not** include those two latest main changes. They add Gmail metadata rules and model relevance scoring, overlapping the local mail pilot here.
- Earlier Timothy branches remain unchanged. Their contract, workspace, finance and assistant functionality is already included in this snapshot; do not merge all of them again on top of it.
- No PR, main merge, deployment, remote database migration, real Gmail sync or paid AI call is part of this handoff.

One review branch preserves the working local application. Splitting this accumulated state into independently mergeable feature branches requires separating shared AppData, schema, locale, route, worker and migration changes. Do that against current main before opening production feature PRs; the current snapshot is not a proposed long-lived development branch.

## Review by feature

| Area | Included behavior | Main review locations |
| --- | --- | --- |
| Grants | Taiwan/U.S. source discovery, local six-hour worker refresh, saved applications, planned submission dates, tasks shared with Today/Calendar, optional signed-project links | `lib/grants`, `lib/actions/grants.ts`, `components/views/grants.tsx`, decision 0017 |
| Manager access | Artist-owned workspaces, explicit invite/accept/revoke lifecycle, server-owned plan/seat capability, read-only artist combinations on Today/Calendar/Projects/Finance, access refresh after revocation | `lib/manager`, `lib/data/manager*.ts`, `lib/actions/manager.ts`, decisions 0018–0020 |
| List loading | 20-row cursor pages for projects, files, grant lists and inbox; inbox counts and summaries in the shell, full messages fetched when opened | `lib/data`, `components/app/cursor-pages.tsx`, decision 0022 |
| UI and input | Typed date/time with pickers, role-switch cancellation, workspace search, responsive help bubbles, compact Drafts/template layout, finance currency and cash-planning refinements | `components/app`, `components/views`, `lib/calendar` |
| Existing Timothy features retained | Bilingual Word contracts/quotes, PostgreSQL catalog plus private object storage, bounded local assistant/history and usage display, cross-page assistant, multi-currency finance | `lib/templates`, `lib/ai`, `docs/setup/document-templates.md` |
| Local trial fixtures | Repeatable October–November examples in local PostgreSQL and local Storage, separate sample manager roster | `lib/local-trial`, seed scripts, `docs/setup/local-trial-data.md` |
| Gmail experiment | Metadata routing, synthetic relevance seam, explicit review/import, bounded plain-text reads, payment protection and deduplication; disabled by default | `lib/mail`, `components/views/mail-review.tsx`, decisions 0021–0022 |

Manager portfolio pages are read-only. Billing, production manager entitlements, invitation email delivery and cross-artist editing are not implemented. Grant tasks do not create signed deals or submit applications. Creator-platform analytics has explanatory connection links, not an implemented Spotify/Apple analytics import.

The Gmail pilot is experimental and overlaps upstream. Real mailbox behavior and the enabled Gmail browser journey have not been accepted for release. Imported messages currently remain after Gmail disconnect; retention requires an explicit product decision before a real-data pilot.

## Database and object storage

This snapshot contains generated migrations 0026–0031 based on main at `2a981de`. Current main independently uses 0026–0028 for Gmail. The two chains are incompatible: **do not concatenate the journals, run this chain on Janice's current-main database, or copy local migration bookkeeping into another database.**

Before merging, retain main's migrations unchanged, reconcile the schema and Gmail design, and regenerate the unmerged feature migrations after current main. Validate both a fresh database and an upgrade from main, using isolated databases and backups. No migration reconciliation has been performed in this publication step.

Pushing Git commits does not transfer local rows, credentials or Storage objects. Use an isolated local database and Storage bucket for this review snapshot, then follow the template/trial setup guides if sample records are wanted. Seed scripts refuse remote endpoints. Existing local data was not changed by the publication step.

## Verification

Publication checks on this snapshot:

- ESLint, TypeScript, translation parity (2,311 keys and 74 registry labels), 216 unit tests and production build.
- Changed text and DOCX XML scanned for credential patterns; no findings. Local environment files, budget ledgers, AI recordings, trial manifests and database data are excluded.

Prior local acceptance evidence (not rerun as part of publication):

- 112 HTTP/action assertions for manager isolation, grant/calendar flow and project paging.
- 33 database pagination assertions.
- 40 synthetic inbox/mail assertions, including 205-row paging, owner isolation, cancellation and duplicate protection.
- Desktop/mobile inbox inspection; detailed limits are in `docs/testing/inbox-mail-acceptance-2026-10-13.md`.

Older dated acceptance documents describe their state at the time, including "local only" or "not pushed". This handoff supersedes those publication-status statements only; it does not broaden their test claims.

## Suggested next review sequence

1. Compare upstream Gmail PRs #9/#10 and decisions 0021/0022; agree on one ingestion and relevance implementation.
2. Extract grants and manager features into small, current-main-based PRs with separate generated migrations.
3. Port pagination and UI refinements onto that agreed data model; retain owner/manager isolation and cursor tests.
4. Run fresh/upgrade migration checks and the acceptance scripts, then review deployment flags and production scheduling separately.
