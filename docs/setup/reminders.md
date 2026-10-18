# Daily briefing and invoice reminders

The app shell opens one consolidated briefing after login and on a new workspace-local day. It includes today's workspace events, due action items and invoices to prepare. The overview and notification bell remain available. Reading or opening a reminder does not mark an invoice sent or a payment received.

## Preparation workflow

1. Add or edit an incoming USD payment and optionally set **Invoice preparation reminder date**. This date is separate from the payment due date and can be saved before billing details exist.
2. When the date arrives, the briefing offers **Prepare now** or **Remind me later**. An existing invoice uses its issue date instead; the payment reminder is suppressed while a non-cancelled invoice exists.
3. Prepare now opens the exact existing invoice or a new editor preselected to the payment. Existing partner import, explicit billing defaults, optional partner writeback and PDF preview remain the source of billing data.
4. Snooze for one, two or three hours, or choose a custom date/time in the workspace timezone, up to 30 days ahead. The deadline is stored in PostgreSQL and survives reloads. An ambiguous daylight-saving time must be corrected.
5. Continue with the existing [Gmail draft workflow](invoices.md). The person reviews and sends in Gmail; the reminder never sends mail or creates an invoice on its own. Gmail-extracted details must already have passed the existing confirmation flow before becoming partner/project data.

Only positive, outstanding, non-void USD receivables are eligible for new invoice preparation. Linked projects must belong to the workspace, be signed and not archived. Portfolio mode does not grant artists' invoice or mailbox permissions, and manager reminders use the existing authorized artist selection. Each row includes its artist name; opening details retains the selected scope. Artist invoice and Gmail actions remain owner-only. Sample preview can show its own read-only briefing without writing notification state.

## Storage and delivery

- Migration `0033_huge_zaran.sql` adds the nullable `payment.invoice_on` date and an index. Existing migration history is unchanged. Older payment edits that omit the field preserve its value.
- Snoozes and read markers reuse `notification_state`, scoped to the signed-in person. Invoice records, PDF storage and Gmail consent continue using the existing invoice architecture.
- `/api/reminders` is authenticated and owner-scoped, returns no-store responses and pages invoice reminders with a 20-row date/ID cursor. The bell and briefing share one provider rather than polling per row.
- The visible app refreshes the feed every 30 seconds and on focus/visibility changes. Network polling pauses while a dialog is open. A local timer checks loaded snoozes; missed reminders can appear on returning to the app. Background browser throttling means this is not an exact-time delivery guarantee.
- Welcome deduplication uses the non-secret session ID and workspace-local date in tab-session storage, separately for each selected scope. A newly opened tab or new login can show the briefing; normal navigation and reloads do not repeatedly open it. A due snooze can open it again; active forms/dialogs defer interruption.
- Browser notifications are optional and requested only after the person clicks the enable control. Their text is generic, without invoice names or amounts. Permission is never enabled automatically.

## Production follow-up

This is an in-app reminder implementation, not a closed-browser push service. Reliable delivery after closing the site requires push subscriptions, a service worker, a server-side due-reminder dispatcher, idempotent delivery records and permission/preferences handling. A future iPhone app also needs device registrations and APNs delivery. The stored absolute snooze deadlines can be reused; those delivery transports are not implemented here.

Sources: [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).

## Local validation

Run the app and local PostgreSQL first, then:

```sh
npm test
npm run i18n:check
npx tsc --noEmit
npx tsx --conditions=react-server scripts/check-daily-briefing.mts
```

The disposable integration script checks ownership, pagination, snooze persistence and validation, preparation dates before billing details, eligible project states, and absence of automatic invoice creation. It cleans its synthetic identities and records. `BRIEFING_QA_HOLD=1` retains fixtures for browser inspection until the script receives SIGTERM; its finally block then cleans up.

Browser QA verified the automatic login dialog, custom snooze persistence after reload, reopening after an expired synthetic snooze, routing to both existing invoices and the correct unprepared payment, cancellation, and the 390px layout. Browser/OS notification permission was not granted during QA. No real email, Gmail draft, push notification, deployment or Git push was performed.

Validation result: 255 unit tests, 50 disposable reminder integration assertions, locale parity (2,600 keys), TypeScript, targeted lint and an isolated production build passed. The build retains the existing dynamic-filesystem tracing warning in `lib/ai/model.ts`.

Fix validation: the manager-view suppression was removed. The bell now provides a manual Daily briefing entry. Deferred reminders retry after focus or dialog changes. The real workspace timezone is retained for manager reminders even when the underlying local preview preference is enabled. Unit tests cover artist selection, labels and absence of owner-data fallback; local integration covers three artists and access boundaries.

Manager fix validation completed: 256 unit tests, 54 local integration assertions, TypeScript, targeted lint and 2,603 matching locale keys passed. Browser QA confirmed a new login with persisted all-artist selection automatically opens the briefing, selecting one artist narrows the contents, and the bell can reopen it. Artist selection popovers defer the automatic dialog until the selection is finished. The temporary manager, artist records and sessions were cleaned after QA.


## Minimized agenda

Opening an item, closing the briefing or choosing **Minimize reminders** keeps a compact **Today’s agenda** launcher beside the assistant. It survives normal page navigation and reloads within the same tab, login, selected workspace scope and local day. Reopening in the same mounted shell restores the list position. This is presentation state only; no new database records or polling loop are introduced.

The badge counts currently available agenda items, not unread messages or a completion percentage. Opening details never completes a task or payment. Actual completion and snooze state continue to come from the shared reminder feed. A plus sign indicates more server-paged reminders, and an ellipsis indicates loading or an unavailable count. Native dialogs temporarily hide the floating controls to avoid competing with editing.

Local validation: targeted lint, TypeScript, 2,605 matching locale keys and 54 disposable integration assertions passed. Browser QA verified detail navigation, reopening the original agenda, switching pages, reload persistence, and 390px/320px layouts alongside the assistant, including its expanded panel. No messages were sent and no Git push was performed.


## Completion and preparation stages

Completed or archived to-dos leave the agenda based on persisted task state, even if an old snooze has expired. Restoring a to-do makes it actionable again. Viewing an item alone never completes it.

Saving an invoice replaces its unprepared-payment reminder with a confirmation reminder that includes its current status. It does not mean the invoice was sent or paid. A successful Gmail draft completes the preparation step and is excluded from the briefing; it remains available in the invoice review area for the person to review and send. Queued/in-progress draft creation is also excluded. Missing drafts, ambiguous creation/delivery and ordinary drafts remain actionable. Payment collection remains an independent reminder until settled.

Invoice panel mutations explicitly reload the shared reminder feed. Opening the minimized agenda also refreshes it. Automatic opening is skipped when there are no actionable items; the bell can still open the empty state manually. Existing background refresh and server ownership rules remain unchanged.

Completion validation: 257 unit tests, 65 local reminder integration assertions and 78 fake-Gmail integration assertions passed, plus TypeScript, targeted lint and locale parity. Browser QA completed a persisted to-do (badge 5 to 4), saved a new invoice (unprepared becomes confirmation), reopened/reloaded the agenda and signed out/in without restoring the completed to-do. A synthetic all-resolved workspace showed a zero badge and did not auto-open an empty briefing in a fresh tab. Fake Gmail checks verified successful draft exclusion, missing/ambiguous draft recovery, valid PDF attachments and zero send calls. No real Gmail, mail delivery, deployment or Git push was performed.
