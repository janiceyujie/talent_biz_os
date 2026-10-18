# Manager capacity and loading: local validation, 2026-10-18

## Scope

Local working-tree changes only. No commit, push, deployment, real email or paid API. No dependency or schema migration was added. Manager access remains behind the existing local-development feature gate; this is not a production launch approval.

The launch allowance is three connected artists, with no minimum: one and two work immediately. The supported entitlement range is 1–30, configured by trusted server/database entitlement records, never a client toggle. Basic accounts do not gain management access. Existing artist-owned invitations and read-only manager access remain in place. Multi-employee agency roles, billing, write delegation and production rollout are separate work.

## Behavior

- The picker shows connected count / allowance, names the single selected artist, supports clearing selection and adds search above three artists. The list scrolls while the dismissal button stays visible.
- Capacity enforcement and pending/revoked membership checks are server-side. Invitation creation locks in the same person-first order as acceptance/leave. Concurrent acceptance of the final slot cannot exceed the allowance.
- Calendar requests follow the displayed month with adjacent-week padding. Finance requests only the selected currency, including signed projects without receivables for contract/unbilled insights. Reminder requests preserve overdue tasks and unpaid balances.
- Manager workspace loads only its active tab. Message pages contain 20 rows and use timestamp + ID cursors, preserving PostgreSQL microseconds. Financial summaries are aggregated in PostgreSQL rather than returning historical receipt bodies.
- Selection/query changes cannot display stale artist records. Focus refresh and visible-page reminder polling refresh data; the existing access boundary also rechecks permission. Browser-delivered data cannot be retroactively recalled, and revocation is not an instantaneous push notification.
- Calendar payment labels now preserve their currency. Portfolio calendar display uses the actual workspace time zone rather than the sample workspace zone.

## Validation

- 321 unit tests passed; ESLint, TypeScript and bilingual catalog checks passed.
- `scripts/check-manager-capacity.mts`: 101 synthetic local checks. Covers allowances 1, 2, 3, 10, 20 and 30; all eight subsets of three; concurrent final-slot acceptance; revoke/reinvite/leave/decline; anonymous and cross-artist denial; downgrade/disabled entitlement; date/currency-scoped reads; unbilled signed projects; 45 same-timestamp messages over pages 20/20/5; SQL/domain finance agreement including withholding, corrected/withdrawn receipts, legacy short payment and JPY rounding.
- Existing `check-workspace-flows.mts`: 112 checks passed, including data isolation and paginated projects. Existing `check-daily-briefing.mts`: 65 checks passed.
- Browser checks: three-artist picker, single selection retained across Calendar and Finance, 30-artist search, month navigation, USD finance values, USD/JPY calendar labels, and 390px picker layout (no horizontal overflow). All fixtures are synthetic and removed after testing.
- Production compilation uses an isolated temporary copy and dummy local SMTP/database settings; it does not replace the running development build or send mail.

## Capacity boundaries

Thirty is a tested functional roster size, not a proven production load or concurrency SLA. Existing overview calendar limits remain explicit. Detailed workspace collections retain safety caps (1,000 events/tasks/projects and 2,000 payments); exceeding them suppresses incomplete totals and links to the manager workspace date filters/SQL summaries. Full currency history is still loaded for detailed finance charts and cash-flow tools within that cap. Larger real datasets need further ledger pagination/aggregation and load testing before an Agency launch.

Pending invitations are bounded to 100. Existing database constraints allow a broader numerical entitlement range, but application access rejects values outside 1–30. No destructive constraint rewrite was made.
