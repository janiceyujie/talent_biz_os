# Inbox and local Gmail review acceptance

Date: 2026-10-13. All changes local to `user/timothy0324/local-integration`. No push, merge, real Gmail read or paid AI call.

## Reproducible checks

- `npm test`: 216 passing tests, including new bounded MIME, payment routing, provider and skipped-metadata privacy checks.
- `npx tsx --conditions=react-server scripts/check-inbox-mail.mts`: 40 assertions using disposable local accounts, 205 messages, a synthetic Gmail connection and injected provider/queue implementations. Requires the local app at port 3000 and migrated local PostgreSQL. The script enables the mail gate only in its own process, not the app or worker. Fixtures are removed on completion or failure. `--keep-for-browser` is an explicit temporary verification option and requires cleanup after browser checks.
- TypeScript and focused ESLint checks passed; i18n checked 2,311 keys and 74 registry labels.
- `npm run build` passed. The pre-existing `tsconfig.json` was restored after the build.
- Disposable database accounts/messages and the temporary credential file were removed after browser verification.

The acceptance script verifies 20-row pages, all 205 records across equal microsecond timestamps, bounded summary payloads, on-demand old-message details, full status counts, per-project activity, earlier sender/date matching, dismissed filtering, malformed/cross-filter/cross-workspace cursors, authenticated/private HTTP reads, metadata-only recovery, owner-only import, manager rejection, duplicate suppression, fresh payment protection, in-flight cancellation, safe error codes, manual retry, review pagination and revoked-owner handling.

Queue emissions are recorded in memory; no analysis worker is called. Synthetic message bodies and credentials must never be used as production fixtures.

## Browser checks

Using a disposable account against localhost:

- Initial inbox rendered 20 summary buttons, with the full matching count.
- Load more expanded the list to 40 rows.
- A direct link to a message beyond the first 200 opened its full body.
- An analyzed message still offered the existing project using an earlier confirmed sender match.
- At 390 px width, the page had no horizontal overflow. Selecting another message focused its H2 after async content arrived.
- No browser console errors were recorded during these checks.

Desktop evidence: `/private/tmp/taloox-inbox-pagination-desktop.png`.

The Gmail review panel remains gated off in the normal app. Its PostgreSQL services and worker were tested with synthetic inputs; real OAuth/full-message handling and an enabled live Gmail browser journey are not claimed as verified.
