# Local integration with Janice's October 10 updates

Status: local only. No commit, push, pull request, deployment or production database change.

## Sources

- Main: `2a981de` (`origin/main` fetched on October 10, 2026).
- [PR 6](https://github.com/janiceyujie/talent_biz_os/pull/6): connected Gmail ingestion design and architecture decisions.
- [PR 7](https://github.com/janiceyujie/talent_biz_os/pull/7): Graphile Worker queue for pasted/uploaded message analysis, strict ID-only jobs, worker retries and analysis failure handling.
- [PR 8](https://github.com/janiceyujie/talent_biz_os/pull/8): mailbox OAuth, encrypted refresh-token storage, Gmail settings and disconnect job.

The GitHub pull-request listing did not contain any merged Timothy feature PRs. The local overlay preserves the contract-storage, workspace-experience, assistant-efficiency and finance-cashflow features, plus the uncommitted Drafts layout and finance currency regression fixes.

## Local branch and recovery

`user/timothy0324/local-integration` starts at the fetched main commit. The integrated Timothy changes remain uncommitted for review. The branch has no upstream, so it does not track main for a push. Published feature branches and main were not rewritten.

The prior checkout is recoverable from `user/timothy0324/draft-layout-polish` plus the retained recovery stash named `local UI and finance recovery before Janice integration 2026-10-10`. A reviewed source overlay was also retained outside the repository for local recovery.

## Integration decisions

- InfoHint retains local accessible labels, Escape dismissal, touch support and viewport positioning, and accepts Janice's new bulleted hints.
- Modal retains the local safe close button and accepts Janice's narrow layout.
- Settings uses the new Gmail row; the obsolete Coming soon Gmail placeholder was removed.
- Financial currencies, local assistant context/history limits, contract downloads, role cancellation, workspace search and the revised Drafts layout remain present.
- Existing Google credentials, storage objects and document-template rows were preserved. No Google consent, mailbox connection, email ingestion or paid AI request was performed during integration.

## Database migration conflict

Both branches had migration 0025 and a 0025 snapshot. Main's `0025_mail_connection.sql` and snapshot are canonical and unchanged. The unmerged local template and currency changes were regenerated with `npm run db:generate` as `0026_concerned_clea.sql`, after main's mailbox migration. The original local migration files remain recoverable in their feature branches and recovery stash.

The existing development database already contained the old template/currency changes. Replaying the regenerated CREATE TABLE would fail and risk an inappropriate reset. A one-time local verification instead:

1. Refused a non-loopback database address.
2. Ran the full integrated migration chain on an empty temporary local database.
3. Applied only main's additive mailbox migration to the existing development database.
4. Compared all application-table columns, constraints, indexes and RLS flags against the freshly migrated reference.
5. Checked unchanged row counts for accounts, sessions, workspaces, projects, payments, templates, messages and files.
6. Recorded the regenerated migration as already applied only after exact schema parity, preserving historical migration rows.
7. Ran the normal migration command and installed the Graphile Worker schema.

The disposable reference database was then removed. No existing application table or business data was dropped. A fresh checkout/database uses the ordinary `npm run db:migrate` flow; do not copy the one-time local bookkeeping adjustment to production or another database without independent schema verification.

## Functional boundary

Gmail connection is implemented, but Gmail sync/automatic reading jobs are not yet registered in the upstream worker. Its registered jobs are `message.analyze` and `mail.disconnect`. The production primary/backup model router and Cloud KMS integration remain design decisions rather than completed functionality in this main revision. The local Luna experiment keeps its existing isolation and budget safeguards.

## Validation result

- `npm ci` installed the dependencies adopted by main.
- `npm run lint`, `npx tsc --noEmit`, `npm run i18n:check` and production build passed.
- 157 tests passed in 29 suites; no paid model calls.
- Fresh-database migration chain and existing-local-database schema comparison passed.
- `npm run db:migrate` completed including the queue schema.
- Local web service returned the sign-in screen successfully; authenticated UI workflows were not retested in this session because the browser was signed out.
- The local worker started with an empty queue and registered both upstream jobs.
- Google sign-in credentials exist locally, but `MAIL_KEY_DEV` is not configured. Gmail consent/connection was not enabled or exercised; see `docs/setup/gmail.md` before connecting.
- Recovery stash retained; no GitHub changes.
