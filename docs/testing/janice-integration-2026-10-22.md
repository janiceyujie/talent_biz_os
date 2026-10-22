# October 22 upstream integration

**Sensitive areas:** database, auth/access, AI routing, dependencies.

Integrated `origin/main` through `bac6de8` without publishing or merging main.
The five existing Timothy branches retain their cumulative review order:

1. `workspace-foundation`: canonical inbox/file paging, server search,
   correspondent matching, auth fixes, document templates, database-backed
   assistant conversations and global AI pause; manager and preview boundaries.
2. `invoice-settlement`: Invoice/PDF/Gmail drafts, billing defaults and addresses,
   tax references, audited currency correction, partial receipts/withholding,
   receipt correction/withdrawal, debt reopening and close-out checks.
3. `daily-reminder-experience`: daily briefing, role/profile flows, manager
   one-to-three-artist operation and a thirty-artist capacity ceiling, scoped
   page queries, SQL finance aggregation and twenty-message cursor pages.
4. `opportunity-discovery`: eligibility, official award/competition/showcase
   sources, disciplines, daily/manual refresh and versioned change notices.
5. `ui-visual-polish`: frosted surfaces and the folded-page assistant mascot,
   adapted to the upstream conversation implementation.

Published ancestors remain in history. These are cumulative branches: review
and merge in that order, rather than treating their main-relative diffs as five
independent patches. No force push is required for this integration.

## Storage compatibility

Main migrations `0000` through `0049` are unchanged. Regenerated private deltas:
`0050` foundation, `0051` invoices, `0052` opportunity metadata, and `0053`
opportunity disciplines/change history. Fresh databases and an exact-main
upgrade both passed all 54 migrations.

`payment_receipt` is now the only operational receipt store. Domain adapters
preserve the existing form/audit behavior without maintaining a second JSON
ledger. Cash and withholding are separate; automatic short receipts remain
outstanding. Receipt amendments reopen a completed project when debt returns.
Gmail notice receipts keep stable IDs for correction and withdrawal.

**Existing private local databases:** do not replay this migration chain over
an older private chain with conflicting migration numbers or JSON receipts.
For this local integration a new database was created from the canonical chain,
then the old database was copied in a consistent read transaction. Legacy JSON
and settled-column receipts were converted, all source table counts and target
foreign keys checked, and the original database retained unchanged. Existing
Word template IDs/files were retained with their text represented as content
blocks; the canonical publisher can publish later versions separately.
Never run this private-data upgrade against production without a reviewed
migration plan and backup.

## Verification

- Foundation: 400 unit tests plus the additional receipt-backed manager test;
  types, lint, locale validation, build and fresh/main-upgrade migrations.
- Invoice: 478 unit tests; 198 receipt, 31 currency correction, 125 Invoice and
  160 fake-Gmail checks. Fake Gmail recorded **zero send calls**. PDF bytes
  matched the draft attachment; no duplicate finance entries.
- Experience: 493 unit tests; 101 manager capacity/access checks and 65 daily
  briefing checks. Capacities 1, 2, 3, 10, 20 and 30; message pages 20/20/5;
  simultaneous last-seat acceptance, revocation and scoped finance verified.
- Opportunities/full UI: 531 unit tests and 74 opportunity workflow checks;
  versioned notice persistence, quiet identical/editorial refresh, personal
  read/snooze, stale acknowledgements, scope isolation and 20-row history pages.
- Each branch passed types, lint, locale checks and production build.
- Browser smoke check used a disposable account: login briefing, minimize and
  reopen entry, assistant dock, deterministic data answer, same conversation
  on the full page, and a recoverable paused-AI response with loading stopped.

Tests used isolated localhost databases and synthetic identities. No real
Gmail message, paid AI request or external calendar write was performed.
Daily opportunity scheduling requires the local grant worker; production
hosting and Google authorization still need their deployment checks.
