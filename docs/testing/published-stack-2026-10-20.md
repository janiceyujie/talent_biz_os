# Personal branch publication — 2026-10-20

Sensitive areas: database migration lineage, tenant-scoped calendar synchronization, payments and manager access.

The branches remain cumulative: workspace-foundation -> invoice-settlement -> daily-reminder-experience. Each preserves its previously published ancestry. Main is integrated through 49f277c; this does not merge any personal work into main.

## Foundation

Includes Janice PRs 15–19: visible-page refresh, worker retries/Gmail push checks, Google Calendar background/two-way synchronization, workspace time zones and recurring-series project links, open-deal planning and cancellation confirmation, compact month/day details, and inbox refinements.

Preserves local manager/grant/template features, currency separation, bounded inbox loading, tooltip safeguards and the requested focused-card inbox layout. Expected unsigned plans do not count in forecasts or outstanding totals; settled cash remains visible. Full partial-receipt accounting is added by the next branch.

Canonical main migrations 0000–0037 are byte-identical to main. The private branch's unmerged conflicting feature migration was regenerated as 0038. Never run this replacement migration chain blindly against a database that already used the former private chain. Back up and migrate that local database separately; the currently running local database is unchanged by publication.

Verified: 332 unit tests, TypeScript, ESLint, 2,550 locale keys/75 registry labels and the standard production build. Fresh installation and canonical-main upgrade both apply 39 migrations successfully on disposable local databases. No real mail, Google account mutation or production migration is performed.

## Invoice and settlement

Adds the existing invoice PDF/Gmail draft, structured billing addresses, local tax references, partial receipts/withholding and append-only correction/withdrawal flows. New invoice work includes fetching the current payment when preparing a document and Taiwan issuer-readiness preferences; those preferences cannot issue official e-invoices or accept provider credentials.

The unsigned-deal rules now preserve recorded partial cash, withholding and real outstanding debt. Cancel-open only removes wholly unpaid plans; closing still checks all debt. Owner and manager financial calculations remain currency-separated.

The invoice delta is generated as 0039 after the shared 0038 migration. Both fresh and main-upgrade test databases now have 40 migrations. Verified: 410 unit tests, TypeScript, ESLint, matching locale keys and standard production build. The receipt-aware manager projection includes project stage while retaining recorded cash.

## Complete experience

The final branch includes both preceding branches and the complete reviewed local version: persistent daily/manager reminders, 1–30 artist capacity architecture and bounded data loading, glass UI and assistant motion, optional occupation/profile setup, explainable opportunity eligibility, competitions/exhibitions/showcases alongside grants, daily grant refresh and manual refresh, plus the latest invoice readiness work.

All 775 non-migration source/document/assets files from the verified local working tree were byte-compared before this publication note was extended; there were zero differences. The final schema snapshot matches the previously verified local snapshot, excluding migration identifiers only. All 76 canonical main SQL/snapshot files remain byte-identical. This is preservation evidence, not a claim that every possible user journey has been exhaustively tested.

Verified again on the isolated final branch: 433 unit tests; TypeScript, ESLint, 3,633 bilingual locale keys/75 registry labels and standard production build. Both fresh and main-upgrade databases complete the 41-migration chain. Existing local acceptance evidence remains applicable to the identical source: 198 receipt checks, 160 fake-Gmail invoice checks (zero sends), 101 manager checks, 74 opportunity checks and 23 integration checks. Real Google OAuth/calendar round-trip is still unverified.

Migrations are now canonical 0000–0037, shared workspace 0038, invoice 0039 and opportunity metadata 0040. The running local checkout and its already-migrated database were intentionally left unchanged; these publication worktrees are separate. This avoids replacing an in-use database's migration history. When updating a previously migrated private-branch database, use the backup/data-preserving migration procedure described in the October 19 report, not blind migration-ledger edits.

The remote branches should be reviewed in dependency order. To try the complete version, use daily-reminder-experience. No main merge, force push, customer email or production database change is part of this publication.
