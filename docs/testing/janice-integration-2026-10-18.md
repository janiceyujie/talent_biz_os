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
