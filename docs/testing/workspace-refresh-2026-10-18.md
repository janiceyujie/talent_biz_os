# Workspace refresh review order

Base: origin/main at 5f03a9169b49871e862030447489eb0441c8fbed (Janice Gmail intake updates).

The six superseded personal remote branches have been removed at Timothy's request. Their commit tips and a verified Git bundle remain backed up locally. Do not recreate or merge them alongside these refreshed branches.

1. `user/timothy0324/workspace-foundation`, reviewed against `main`: the previously published workspace features, including delegated manager access, grants, editable document templates, assistant safeguards, finance tools, bounded list loading and mailbox compatibility. These share schema and workspace identity, so this is the shared base rather than duplicate patches on each subsequent branch.
2. `user/timothy0324/invoice-settlement`, reviewed against the foundation branch: invoice preparation, PDF, Gmail drafts, tax references, partial receipts and withholding, correction history, project settlement and archive controls.
3. `user/timothy0324/daily-reminder-experience`, reviewed against invoice-settlement: login agenda and a persistent minimized launcher for continuing today's work.

Review in that order. These are dependent branches, not three independent changes against main. After squash-merging a parent, rebase the remaining delta onto the resulting main and rerun CI before merging the child. Do not merge the final cumulative branch and then merge its parents again.

## Intake follow-up and branch coverage

The intake update belongs to `workspace-foundation`: stable list/reader columns,
Back keeps the open message and reading position, all three intake tabs remain
visible, and isolated sample classification supports moving, restoring and
resetting examples. Disconnected workspaces show a Gmail connection entry.
Preview actions never call a mailbox, model or workspace mutation.

This follow-up is merged into each dependent branch in order, without rewriting
already published commits. The final reminder branch contains the complete local
product; the foundation and invoice branches intentionally stop at their own
feature scope. No branch is merged into main by this publication.

The six removed branch tips were checked against the refreshed source trees:

| Removed branch | Retained scope | Refreshed destination |
| --- | --- | --- |
| `workspace-setup` | Initial setup, already an ancestor of main | main and all three branches |
| `contract-storage` | Document template storage, versions and downloads | workspace-foundation |
| `workspace-experience` | Workspace navigation, calendar, editor and UI improvements | workspace-foundation |
| `finance-cashflow` | Cash-flow planning and multi-currency finance | workspace-foundation |
| `assistant-efficiency` | Local-answer routing, context and history efficiency | workspace-foundation |
| `workspace-features` | Integrated manager access, grants, contracts, finance and paging | workspace-foundation |

All paths changed by those old feature branches still exist in the final source
except the superseded local migration files `0025_document_template.sql`,
`0026_sad_thaddeus_ross.sql` and `0029_integrated_local_features.sql`. Their schema
changes are represented by the refreshed migration chain described below; they
must not be replayed alongside it. Gmail-related implementations were reconciled
with Janice's newer main instead of retaining duplicate older code. This is a
source and regression audit, not a claim of new end-to-end live-provider testing.

The current local preview flow was browser-checked using synthetic data: waiting
mail moves to Messages or Filtered out, restoration updates counts, empty states
remain usable, reset restores the fixtures, and disconnected tabs show a
connection prompt. The preceding local full suite passed 313 tests; foundation
passes its 257 tests, type check, lint and translation checks. No production data
or real mailbox is used.

## Integration choices

Keep Janice's canonical Gmail fetch and action-oriented message review. Retain owner checks, cancellation-safe pagination, independent reader scrolling and preview isolation. Legacy explicit imports use the same deduplication key as automatic fetch; both lock ownership and the decision before persisting. A revoked owner cannot persist a message fetched concurrently with revocation.

## Migration boundary

All migrations already on main, including `0029_gmail_messages.sql`, remain unchanged. Foundation additions are generated as `0030_workspace_foundation.sql`. Invoice, tax-reference and receipt-ledger additions follow in `0031_invoice_settlement.sql`. The daily reminder branch adds no migration.

A developer database that previously applied Timothy's old `0029_integrated_local_features.sql` has a different history. Do not blindly apply this chain to that database or edit the migration journal. Back up first, migrate a separate database, then copy and verify application data. The original local database is retained for rollback.

## Foundation validation

Type check, lint, 257 unit tests, 2,414 translation keys, 74 registry labels, and webpack production build pass. The isolated build uses the repository CI placeholders. Synthetic Gmail regression checks cover concurrent import, retries, attachment notices, paginated details, and ownership or classification changes during fetch. Real Gmail and paid model calls are not used.

## Invoice and settlement validation

The branch passes lint, type checking, 313 unit tests, 2,942 translation keys and 74 registry labels. The two-step migration chain was applied to a separate local database; hashes and row counts match all original columns in all 46 application tables after data copy. Original data and the previous migration history remain backed up.

Local HTTP acceptance on the integrated implementation covers 153 receipt checks (including withholding plus partial payments, correction/reversal, outstanding costs and re-closing), 125 invoice checks, 112 workspace/manager/grant checks, 40 inbox checks and 33 pagination checks. The fake Gmail suite passed 120 checks, created four synthetic drafts, and made zero send or overwrite calls. PDF attachment bytes match private storage. No customer email is sent. The standard Turbopack production build also passes with isolated dependencies. Test worktrees require their own dependency tree for the normal bundler: symlinked Next.js dependencies produced inconsistent request context during the isolated test run.

The tax data importer and UI retain reference-only states as pending for invoice applicability. A reference row is not a reviewed service tax rule. See the tax setup documents for coverage limits and refresh work still required before production.

## Final reminder validation

The final branch passes lint, type checking, 313 unit tests, translation checks and the standard production build. On the final two-migration local database, the receipt suite passes 153 checks, daily reminders pass 65 checks, canonical Gmail fetch passes 9 checks, and the imported tax-reference catalogue passes 67 checks (19,219 reference rows; original rates and rules unchanged).

Browser checks confirmed login agenda visibility, navigation to Finance, minimizing and reopening the agenda, and switching from preview to the actual workspace's own invoice and calendar reminders. No browser console errors were observed. Synthetic UI accounts were removed after verification.
