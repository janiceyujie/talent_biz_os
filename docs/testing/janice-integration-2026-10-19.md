# Personal branch refresh, 2026-10-19

Sensitive areas: database migration lineage, tenant-scoped mailbox history, payment receipt corrections and currency changes. This is a personal-branch integration, not a production deployment.

## Review order

These existing branches are cumulative and preserve their published history. Review and merge in order; the third contains the complete product version. No force push or main merge is used.

| Branch | Scope |
| --- | --- |
| `user/timothy0324/workspace-foundation` | Manager/grant/template workspace, database pagination, responsive action notices, and the latest main mailbox/worker improvements. History mail has its own lazy-loaded 20-row pages and access checks. |
| `user/timothy0324/invoice-settlement` | Everything above, plus billing documents, PDF/Gmail drafts, tax references, receipt/withholding history, project closure guards, currency correction, and structured invoice addresses. |
| `user/timothy0324/daily-reminder-experience` | Everything above, plus persistent daily reminders, manager capacity up to 30 in the architecture, visual refinements, and assistant motion. Includes the complete latest local feature set. |

Main is included through `61627c9` (PRs 13 and 14). Its changes include automatic Gmail push/poll intake, primary/backup AI providers by task, stale worker recovery, history-on-open analysis, thread context, sender verification warnings, payment-notice dismissal confirmation, and queued Google Calendar retries. Existing local-only AI spending/privacy protections remain in place.

Recent billing changes include Address 1/2, country selection, all US states plus DC, Taiwan counties/cities and districts, automatic three-digit postal codes with manual longer-code support, buyer save-back, and default address reuse. Currency correction changes the recorded currency, not the numeric amounts or exchange rates; issued documents and conflicting histories remain guarded. Partial cash and withholding stay separate, and genuine unpaid balances remain in reminders.

## Database compatibility

Canonical main migration SQL and snapshots `0000` through `0034` are unchanged. The old, unmerged feature migrations conflicted with new main numbers and were regenerated after main as `0035_workspace_foundation` and `0036_invoice_settlement`. Address columns are included in 0036. The schema generator reports no remaining changes.

- Fresh installation: run the complete 37-migration chain and the queue migrations.
- Database following canonical main: `npm run db:migrate` adds the feature migrations normally. This upgrade path was tested from all 35 canonical main migrations.
- Database that already applied the former feature migrations: **do not blindly run the replacement chain, edit migration-ledger rows, or reuse their numbers.** Back up the original database, create a fresh database with the reconciled chain, restore data using explicit original column lists, retain queue data, and verify original row counts/content and foreign keys before switching the local connection. Preserve the old database for rollback.

The local copy was verified across 51 public/queue tables: every original column matched counts and content digests; all 85 foreign keys were checked; no disabled triggers remained. Dumps and environment backups stay outside Git. Existing local storage remains unchanged.

`npm run dev` now starts both web and worker, as defined by main. Use `npm run dev:web` when testing only the UI and intentionally withholding external/background activity. This verification never started the real-mail worker.

## Verification

| Check | Result |
| --- | --- |
| Unit tests | 381 passed |
| Receipts, withholding, corrections, reversals, all installments/costs, closure | 198 assertions |
| Currency correction, stale previews, permissions, blocked issued documents | 31 assertions |
| Inbox pagination/history/thread/payment metadata and access | 57 assertions |
| PDF and fake Gmail draft lifecycle | 140 assertions; 5 fake drafts; 0 send/update/delete calls |
| Manager capacity and tenant isolation | 101 assertions; capacities 1, 2, 3, 10, 20, 30 |
| Workspace/grant/calendar workflow | 112 assertions |
| Daily reminders | 65 assertions |
| File/grant/project pagination | 33 assertions |
| TypeScript, ESLint, translations | Passed; 3,494 locale keys and 75 registry labels |
| Production build | Passed |
| Fresh schema, canonical main upgrade, schema generation | 37 migrations; no pending schema differences |

The acceptance database used disposable identities, a local fake Gmail endpoint and the existing local public tax reference catalogue. Initial fresh-database checks exposed missing test fixtures, not application failures; the grant test now creates/cleans its own source and the tax reference catalogue was copied locally before the successful rerun. No customer email, real Gmail API, paid AI evaluation or production migration was executed. Prior browser checks are not represented as new visual testing in this run.
