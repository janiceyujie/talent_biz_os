# Workspace refresh review order

Base: origin/main at 5f03a9169b49871e862030447489eb0441c8fbed (Janice Gmail intake updates).

Existing remote branches are retained as historical backups. Do not merge them again alongside these refreshed branches.

1. `user/timothy0324/workspace-foundation`, reviewed against `main`: the previously published workspace features, including delegated manager access, grants, editable document templates, assistant safeguards, finance tools, bounded list loading and mailbox compatibility. These share schema and workspace identity, so this is the shared base rather than duplicate patches on each subsequent branch.
2. `user/timothy0324/invoice-settlement`, reviewed against the foundation branch: invoice preparation, PDF, Gmail drafts, tax references, partial receipts and withholding, correction history, project settlement and archive controls.
3. `user/timothy0324/daily-reminder-experience`, reviewed against invoice-settlement: login agenda and a persistent minimized launcher for continuing today's work.

Review in that order. These are dependent branches, not three independent changes against main. After squash-merging a parent, rebase the remaining delta onto the resulting main and rerun CI before merging the child. Do not merge the final cumulative branch and then merge its parents again.

## Integration choices

Keep Janice's canonical Gmail fetch and action-oriented message review. Retain owner checks, cancellation-safe pagination, independent reader scrolling and preview isolation. Legacy explicit imports use the same deduplication key as automatic fetch; both lock ownership and the decision before persisting. A revoked owner cannot persist a message fetched concurrently with revocation.

## Migration boundary

All migrations already on main, including `0029_gmail_messages.sql`, remain unchanged. Foundation additions are generated as `0030_workspace_foundation.sql`. Subsequent changes must follow it.

A developer database that previously applied Timothy's old `0029_integrated_local_features.sql` has a different history. Do not blindly apply this chain to that database or edit the migration journal. Back up first, migrate a separate database, then copy and verify application data. The original local database is retained for rollback.

## Foundation validation

Type check, lint, 257 unit tests, 2,414 translation keys, 74 registry labels, and webpack production build pass. The isolated build uses the repository CI placeholders. Synthetic Gmail regression checks cover concurrent import, retries, attachment notices, paginated details, and ownership or classification changes during fetch. Real Gmail and paid model calls are not used.
