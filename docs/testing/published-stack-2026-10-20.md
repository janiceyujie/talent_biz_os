# Personal branch publication — 2026-10-20

Sensitive areas: database migration lineage, tenant-scoped calendar synchronization, payments and manager access.

The branches remain cumulative: workspace-foundation -> invoice-settlement -> daily-reminder-experience. Each preserves its previously published ancestry. Main is integrated through 49f277c; this does not merge any personal work into main.

## Foundation

Includes Janice PRs 15–19: visible-page refresh, worker retries/Gmail push checks, Google Calendar background/two-way synchronization, workspace time zones and recurring-series project links, open-deal planning and cancellation confirmation, compact month/day details, and inbox refinements.

Preserves local manager/grant/template features, currency separation, bounded inbox loading, tooltip safeguards and the requested focused-card inbox layout. Expected unsigned plans do not count in forecasts or outstanding totals; settled cash remains visible. Full partial-receipt accounting is added by the next branch.

Canonical main migrations 0000–0037 are byte-identical to main. The private branch's unmerged conflicting feature migration was regenerated as 0038. Never run this replacement migration chain blindly against a database that already used the former private chain. Back up and migrate that local database separately; the currently running local database is unchanged by publication.

Verified: 332 unit tests, TypeScript, ESLint, 2,550 locale keys/75 registry labels and the standard production build. Fresh installation and canonical-main upgrade both apply 39 migrations successfully on disposable local databases. No real mail, Google account mutation or production migration is performed.
