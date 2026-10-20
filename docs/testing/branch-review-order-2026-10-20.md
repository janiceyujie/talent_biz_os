# Four-branch review order — 2026-10-20

Sensitive areas: existing database migration lineage and account-scoped applicant preferences.

## Review and merge order

| Order | Branch under `user/timothy0324/` | Review base | Responsibility |
| --- | --- | --- | --- |
| 1 | `workspace-foundation` | `main` | Shared workspace, original grant tracking, focused Inbox, Janice integration |
| 2 | `invoice-settlement` | `workspace-foundation` | Invoice PDF/Gmail drafts, receipts, withholding, corrections and settlement |
| 3 | `daily-reminder-experience` | `invoice-settlement` | Daily/manager reminders, manager capacity, profile setup and interface refinements |
| 4 | `opportunity-discovery` | `daily-reminder-experience` | Applicant screening, competitions/exhibitions/showcases, daily and immediate manual refresh |

These are cumulative branches, not four independent replacements for main. Review each against the preceding branch; use **opportunity-discovery** to try the complete product. A comparison against main includes prerequisites. Follow the repository squash-merge policy; after each squash merge, update the next PR's base and verify its diff before merging. Do not merge all four blindly or cherry-pick only the newest commit into main.

## What the split preserves

The third branch keeps original grant search, application tracking, submission tasks, Today/Calendar links, entity-decoding repairs and existing saved applications. It does not expose the new applicant-profile filter or competition discovery tabs. Its discovery query only lists grants; already-followed non-grant records remain accessible, so switching review branches does not strand applications.

The fourth branch adds the discovery UI, account-scoped screening profile, SQL filtering before pagination, bounded Grants.gov detail enrichment, reviewed non-grant catalogue/import tooling, and the daily/grant-only worker. Scheduled refresh is daily at 00:00 UTC; authenticated manual refresh bypasses the scheduled cooldown while sharing concurrent results. The third branch retains its earlier six-hour schedule.

Existing publication history is preserved with forward commits; no force push or main change. The already-published additive migration `0040_handy_dust.sql`, its snapshot/journal and the `kind`/`eligibility` storage contract stay on the third branch. Moving or deleting this published migration could break databases that already applied it. The fourth branch consumes that prerequisite without another migration, duplicate column or data deletion. The schema's evidence type is a shared type-only contract; screening code is in the fourth branch.

No development database, running app or worker is switched by this Git-only split. Previously migrated private databases still require the documented data-preserving migration procedure, not blind migration ledger changes. Public/production integration gates remain unchanged. No mail is sent and no cloud database migration is performed.

## Validation

Both branch tips must pass unit tests, type checking, lint, translation checks and production build before publication. Compare the final fourth branch with the previous complete `5e766fd` tree: only the shared type import and review documentation may differ. All existing migrations must be byte-identical. Original grant text repairs and all payment/manager/Calendar code must remain intact.

Third branch verified after extraction: 425 unit tests, TypeScript, ESLint, 3,633 bilingual locale keys / 75 registry labels and the standard production build passed. Migration files are unchanged.

Fourth branch verified: 433 unit tests, TypeScript (after Next route type generation), ESLint, 3,633 bilingual locale keys / 75 registry labels and standard production build passed. Against complete tip `5e766fd`, all 859 existing tracked files were compared: differences are limited to two type-only imports and two explanatory documents; the shared type contract and this review guide are new. All 83 migration-related files are byte-identical. No database or browser acceptance suite was rerun for the identical runtime; the earlier local acceptance evidence is recorded in the historical publication report.
