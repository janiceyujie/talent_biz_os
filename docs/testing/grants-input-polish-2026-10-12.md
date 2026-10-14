# Grant workspace and numeric input polish

Local review on 2026-10-12, branch `user/timothy0324/local-integration`.

## Changes

- Reused date/time inputs for grant planning deadlines, Finance date filters and payment record dates. Numeric input preserves canonical date/time values and blocks invalid form submission.
- Reused the existing searchable time-zone picker for grant deadlines.
- Added availability filtering to discovery, with current/upcoming/unconfirmed opportunities as the default and passed deadlines available through an explicit filter. Saved applications retain history regardless of availability.
- Ordered verified open opportunities before upcoming, unconfirmed and closed listings; deadlines order each group.
- Added result counts and a reset-filter action for empty searches. Changing filters clears a selected detail that no longer belongs to the visible list.
- Folded source status, completed tasks and task time-zone details. Pending tasks are ordered by date/time; past due dates are labeled Overdue in their own time zone.

## Verification

- 173 tests passed, including four new list tests for status ordering, stale/unknown dates, saved history, Unicode search and source filtering. Source records are not mutated by list filtering.
- TypeScript, ESLint, build, translation parity (2,089 keys / 74 registry labels) and diff checks passed.
- Browser review: empty search/reset; save a grant; reject impossible date/time; save typed `20261020` and `0947`; complete and reopen a task; restore it to pending; type Finance filter and payment dates; discard the payment draft through the existing unsaved-change confirmation.
- PostgreSQL read-back on the isolated test workspace confirmed exactly one grant task on 2026-10-20 at 09:47, Asia/Taipei, restored to open. No payment was created.
- English and Chinese grant filters verified; browser error log was empty. The disposable account was signed out and removed after review.
- Grant and Finance pages checked at 320, 768, 1024 and 1440 nominal widths with no horizontal document overflow. Viewport overrides were reset.

Existing source adapters, refresh schedule and database schema were not changed. All updates remain local; no commit, push or deployment.
