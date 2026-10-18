# Janice integration, 2026-10-18

Sensitive areas: database migration lineage, tenant-scoped inbox metadata, payment receipts, and Gmail ingestion. No production deploy, real email delivery, or paid model evaluation is part of this integration.

## Branch order

1. `user/timothy0324/workspace-foundation`: integrates main through `829e1b3` (bank notices and Gmail thread handling), preserving manager/grant/template features and paged inbox loading.
2. `user/timothy0324/invoice-settlement`: includes foundation, plus invoices, tax references, and the append-only cash/withholding ledger. Bank notices append receipts instead of overwriting settlement totals.
3. `user/timothy0324/daily-reminder-experience`: includes both, reminders and the latest local manager capacity, glass UI, Taiwan billing-document distinctions, and assistant mascot work.

These are cumulative branches. Review in that order; the third is the complete integrated local version. Published history is preserved with merge commits, not force-pushed.

## Migrations

Canonical main migrations `0000` through `0031` are retained byte-for-byte. The previously unmerged workspace and invoice migrations occupied the same numbers as Janice's new migrations. Their schema changes are regenerated after main as `0032_workspace_foundation` and `0033_invoice_settlement`.

A database already using main can run `npm run db:migrate` normally. A new database can run the entire chain. Both paths are tested.

A local database that already applied the old feature-branch `0030_workspace_foundation` / `0031_invoice_settlement` must **not** blindly run the new chain or delete migration-ledger rows. Preserve that database and a full dump. Create a new database from the reconciled chain, restore the existing public data using explicit original column lists, retain queue data, and compare every original column plus foreign keys before changing the local connection. No existing production migration is rewritten.

## Compatibility checks

- Thread context comes from bounded per-message queries; it does not require loading all inbox bodies in the application layout.
- Bank notice body/attachments are not persisted; list/detail endpoints expose structured notice fields.
- Notice confirmations use row locks, tenant and currency checks, revision checks, stable receipt IDs, and actor/time attribution.
- A short payment remains expected. Confirmed withholding is separate from cash and from the amount still owed.
- Corrections and withdrawals remain append-only and can reopen a completed project. Closing requires all receipts and costs to be settled.
- Gmail draft tests use a local fake provider, never a customer mailbox or send endpoint.

## Verification results

All checks used local PostgreSQL and synthetic identities. No real Gmail API, paid AI, or email sends were used.

| Check | Result |
| --- | --- |
| Unit tests | 358 passed |
| Receipt lifecycle, notice integration, corrections, withdrawals, multiple installments and costs | 170 assertions passed |
| Paged inbox, thread filing, reply undo, notice metadata, access boundaries | 50 assertions passed |
| PDF and fake Gmail draft lifecycle, permissions and retry behavior | 140 assertions passed; 5 fake drafts; 0 send calls |
| Manager capacity and concurrent final-seat acceptance | 101 assertions passed; 1, 2, 3, 10, 20, 30 artists |
| Workspace/grant/calendar shared workflow | 112 assertions passed |
| Daily reminder persistence and isolation | 65 assertions passed |
| Files, grants and project pagination | 33 assertions passed |
| TypeScript, ESLint and locale catalogs | Passed; 3,043 translation keys and 74 registry labels |
| Production build | Passed with the existing non-blocking AI recording-directory tracing warning |
| Canonical main upgrade and fresh install | 34 migrations applied; canonical migration bytes unchanged |
| Local data restore verification | All original columns in 51 public/queue tables matched row counts and content digests; 85 foreign keys checked; no disabled triggers |

The pre-integration database, full Git bundle, local edits archive and a final database dump remain available locally as rollback material. Queue state was preserved, and no locked jobs remained after stopping the previous worker. No local secrets, mailbox contents, database dumps or test credentials belong in the Git branches.

After installing the final local checkout, the 50 inbox assertions passed again on port 3000. A browser test selected an existing TWD 1,000 receivable, confirmed a TWD 400 bank notice with TWD 100 withholding, and reopened today's briefing: the reminder showed TWD 500 still due. PostgreSQL readback confirmed `expected`, cash 400, withholding 100 and the actor ID. The disposable browser identities and records were then removed.
