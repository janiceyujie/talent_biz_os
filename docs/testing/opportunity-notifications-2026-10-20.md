# Local opportunity change notifications — 2026-10-20

## Behavior

- Shared daily and manual source synchronization atomically saves a catalogue revision and an immutable `grant_change` when an opportunity is first discovered or its application opening/closing dates change.
- Repeated responses and editorial-only changes do not create events. A deadline changing back to an earlier value is a distinct revision. Unknown dates are represented explicitly.
- Existing catalogue rows start at revision zero; the migration does not announce the existing catalogue as new.
- Discovery alerts are opt-in by person, workspace and region, starting at subscription time. Already tracked applications receive subsequent date changes regardless of the discovery subscription. Historic changes remain accessible on opportunity details.
- Notifications use stable change-ID/workspace-ID keys and existing per-person read/snooze storage. Acknowledging a count uses its snapshot timestamp, so a newer concurrent event stays unread.
- Read changes leave the daily briefing. Later revisions remain unread. The notification feed covers 90 days to align with notification-state retention; the paginated history retains older changes.
- Notification links open the precise opportunity, including expired tracked opportunities. The history shows old/new dates and when the change was observed. Each page loads 20 records.
- Official changes never edit the user's planned submission date, calendar or application tasks.
- This is the existing owner-workspace in-app bell/briefing feed, not cross-artist manager aggregation or background OS push/email delivery. The current manager portfolio feed keeps its existing permission behavior.

## Database and operation

Additive schema migration: `0040_opportunity_change_notifications` (new change table and revision column). Generated from schema; no earlier migration was edited. Applied only to the verified loopback development database. Production migration/deployment is out of scope.

The grant-only worker was restarted with the new persistence code. Its only task is `grants.refresh`, scheduled daily at 00:00 UTC (08:00 Asia/Taipei); manual refresh uses the same code. Local automatic refresh requires the computer, database and worker to remain running. No Gmail, AI or delivery worker was started.

## Verification

- 62 grant/domain tests passed, including repeat suppression, extensions, shorter/unknown deadlines, reverting dates, read-state suppression and UTC/local-day boundaries.
- `scripts/check-opportunity-notices.mts`: transaction-rollback integration test passed. Covers audience isolation, subscription disabled with tracked changes, independent personal reads, stale acknowledgment snapshots, snooze expiry, 20-row cursor pagination and unchanged planned task dates. All fixtures roll back.
- TypeScript, targeted ESLint and i18n checks passed (3,666 matching message keys, 75 registry labels).
- All 12 real official sources refreshed successfully. All 83 original opportunity IDs and eligibility values remained; application/task/watch hashes were unchanged. Zero false change events were generated.
- Browser workflow: a synthetic tracked change appeared in the bell; opening it navigated to the exact opportunity, displayed before/after dates and read state, and reduced unread count from 17 to 16 and briefing count from 7 to 6. At a 390px mobile viewport the detail content and scroll widths were both 356px (no horizontal overflow in that region). Screenshot capture timed out, so this is interaction/DOM/layout verification, not screenshot-based visual signoff. Temporary viewport override was reset.
- The synthetic browser opportunity/application/read state were removed; original data hashes rechecked successfully. Browser returned to Settings.

No Git push, main merge, mail delivery or external application submission occurred.
