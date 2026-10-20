# Janice upstream integration — 2026-10-20

## Scope and provenance

Local source integration only; no commit, push, deployment, real email or remote database mutation.

- Repository: https://github.com/janiceyujie/talent_biz_os.git
- Local branch: `user/timothy0324/daily-reminder-experience`; HEAD remains `4acc841`.
- Common ancestor: `61627c907427d5c768462da97f71e2a566c42ffb`.
- Fetched main: `49f277ccf47aa550aee805e802da0aec5495c7ab`.
- Existing dirty files were backed up and integrated through reviewed three-way source patches. Git ancestry has not been rewritten or merged yet.
- Recovery manifest, original files, staged comparisons and logs: `/tmp/taloox-janice-20261020/` (temporary local storage).

## Upstream changes

| PR | Change |
| --- | --- |
| [15](https://github.com/janiceyujie/talent_biz_os/pull/15) | Workspace change fingerprint and visible-page refresh; worker cleanup/retry corrections; production Gmail Pub/Sub configuration checks; sync labels. |
| [16](https://github.com/janiceyujie/talent_biz_os/pull/16) | Calendar background reconciliation and Google two-way sync infrastructure, independent of visiting Calendar. |
| [17](https://github.com/janiceyujie/talent_biz_os/pull/17) | Plan events, tasks and payments before signing; exclude unsigned expected payments from financial forecasts; cancellation cleanup confirmation. |
| [18](https://github.com/janiceyujie/talent_biz_os/pull/18) | Workspace-zone Google event times, recurring-series project mapping, compact month view and day details. |
| [19](https://github.com/janiceyujie/talent_biz_os/pull/19) | Independent inbox scrolling, mobile reader behavior and Gmail reconnect copy; Google policy/intake/embedding documentation. Embedding changes are design documentation, not a newly enabled production pipeline. |

## Local behavior retained and conflict resolutions

- Inbox: selecting a message leaves its card on the left; returning to the list keeps the right reader. Pagination, lazy history and sample classification tabs stay intact.
- Partial receipts, withholding, correction, withdrawal, audit trails and debt-driven project reopening remain. Closing still checks all receivables and costs.
- Declining/cancelling a deal can cancel wholly unpaid plans. Existing cash/withholding and remaining debt are retained; closing a completed deal does not trigger lost-deal cancellation.
- Unsigned expected plans are excluded consistently from owner/manager outstanding totals, notifications and cash forecasts. Recorded cash and its remaining debt continue counting, including after deal cancellation.
- Manager selection, permission boundaries, date-range loading and 1–30 artist architecture remain. Month view respects manager read-only access.
- Invoice PDF/Gmail draft flow, daily reminders, grants/opportunities, local daily grant schedule and manual refresh remain.
- Local typed date input, glass styles, tooltips and assistant dock remain.
- Fixed a missing ICU `count` parameter caused by upstream dismissed-message copy, and a CSS merge boundary. No other existing locale key changed its ICU parameter set upstream.

## Local database

Only `127.0.0.1:54322/taloox_merged_20261019` was migrated. A pre-change custom-format dump exists inside Docker container `supabase_db_talent_biz_os` at `/tmp/taloox-before-janice-20261020.dump`.

Generated and applied additive migration `0038_sparkling_gressill.sql`: Calendar sync tokens, pushed state, Google deletion marker, suggested project, source ownership and recurring-series project mapping with RLS. Existing local migrations were not edited or deleted.

**Publication follow-up:** upstream 0035–0037 and local 0035–0037 have different histories. Do not blindly apply this local migration chain to an upstream/production database. Reconcile the migration lineage on the publication branch and generate its delta from that branch's snapshot before any remote migration. Source integration here does not imply remote deployment readiness.

## Verification

| Check | Result |
| --- | --- |
| Unit tests | 433 passed |
| TypeScript | Passed |
| ESLint | Passed, no errors or warnings |
| i18n/registry | 3,633 locale keys and 75 registry labels checked |
| Production build | Passed, isolated `.next-test` output |
| Receipt acceptance | 198 checks passed: partial cash, withholding, corrections, withdrawals, multiple installments/costs, reminders and closure gates |
| Invoice draft acceptance | 160 checks passed using fake Gmail: valid PDF, attachment bytes match stored PDF, five draft creates, zero send calls |
| Opportunity acceptance | 74 checks passed: pagination, qualification/profile isolation, tracking/calendar idempotency and ownership |
| Manager acceptance | 101 checks passed: 1/2/3/10/20/30 artists, concurrent last-seat protection, 20/20/5 pagination, SQL totals matching domain including unsigned projects and recorded receipts |
| Integration acceptance | 23 checks passed: change fingerprint isolation, unsigned plans, cancellation retaining cash/withholding/debt, ownership checks, hidden deleted Google events and closure protection |
| Browser | Focused inbox/back behavior verified; month day panel verified; 320px/390px dialog widths remain inside viewport |
| Working tree whitespace | `git diff --check` passed |

Disposable UI identities were removed. The local web server and grant-only worker were restored; the full mail/AI/calendar worker was not started. No actual Google OAuth round-trip, external calendar mutation or real Gmail delivery was tested. Those remain explicit external-integration checks.
