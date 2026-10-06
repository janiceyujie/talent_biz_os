# 0009 — Syncing with Google Calendar

**Status:** Accepted (2026-10-05)

## Context

People want what they create here to appear in Google Calendar, and their Google Calendar to appear here. Today the private subscription link (an `.ics` feed) covers one direction and only roughly: Google refreshes subscribed calendars on its own schedule, often every several hours; the events are read-only there; nothing comes back.

Two-way sync is a long-lived connection to an account we don't control:

- It needs Google permission beyond sign-in, which Google classes as **sensitive**: app verification before more than 100 test users can use it (a verified domain, privacy policy, a reason for each permission, a demo video). Calendar permissions aren't *restricted*, so no paid security assessment (unlike reading Gmail).
- It stores a refresh token that can act on the person's calendar without them present.
- It brings personal events into our database.
- It meets things our model doesn't have: repeating events, edits on both sides, deletions that may be mistakes.

## Decision

### Phases

| Phase | What | Needs |
|---|---|---|
| 0 | The subscription link (built) | — |
| 1 | **Ours → Google**: our events pushed to a dedicated calendar in near-real time | Calendar permission; background work (in-process until the job queue, decision 0008) |
| 2 | **Google → ours**: the person's chosen Google calendars shown here, read-only | Read permission; polling now, Google's change notifications once there's a public HTTPS address |
| 3 | Full two-way editing of project events from Google | Only if people actually edit project events in Google |

Each phase ships on its own; the next starts when the last is in use.

### Permission

- Phase 1 asks for **`calendar.app.created`** only: create calendars, and manage events on calendars this app created. It can't see or touch anything else in the account. Confirm its classification in the console when adding it (Google shows it); plan for verification either way.
- Phase 2 adds read access to the calendars the person picks (`calendar.calendarlist.readonly` to list them, `calendar.events.readonly` to read them), asked when they turn import on, not before.
- Permissions are requested **incrementally**, on the Google account already linked for sign-in (decision 0001), when the person presses 連結 Google 日曆 — never at sign-in. Sign-in keeps only `openid`, `email`, `profile`.
- The request asks for offline access, so we receive a refresh token.

### Where our events go

- A **dedicated calendar**, 「Talent Biz OS」, created in their account on connect. Not their primary calendar: it can be shown, hidden, or colored on its own, and disconnecting can remove it cleanly without touching anything they made.
- What's pushed: **events** (`calendar_event`), confirmed and not archived — the same set as the subscription feed. To-dos and payment dates stay out (they're deadlines, not time someone spends). Project and counterparty go in the description; nothing from messages or money.
- Each event remembers, per connection, its Google event id and version (`etag`) and when it last synced (`calendar_event_sync`), so later edits update the same Google event. Per connection rather than on the event, because two people in a workspace can each connect their own Google account.

### Ownership and conflicts

- **Made here → owned here.** In phase 1 the dedicated calendar is ours to write; if someone edits one of its events in Google, the next push overwrites it. The calendar's description says so. (Phase 3 is where Google-side edits would come back.)
- **Made in Google → owned by Google.** In phase 2 imported events are read-only here, marked 「來自 Google」, not linked to projects. Attaching one to a project means adopting it: a project event is created here and pushed, and the Google original is left alone.
- **Deletion here** removes the Google copy. **Deletion in Google** of a pushed event is undone by the next push in phase 1; in phase 3 it would ask here first rather than delete project data.
- **Repeating events** (phase 2) are shown as their individual occurrences in the visible range, read-only. Our model doesn't gain repetition.

### Storage and security

- Tokens stay in `auth_account` (Better Auth), **encrypted at rest** (`account.encryptOAuthTokens`, keyed by the auth secret). They're used only by the server.
- A `calendar_connection` row per person and talent: Google account, dedicated calendar id, phase-2 calendar choices (later), status (connected, needs reconnecting, error), last failure, last successful sync.
- Imported events (phase 2) are kept in their own table, not mixed into `calendar_event`, so they can be dropped wholesale.
- **Disconnect**: revoke the token at Google, delete it and the connection, clear the Google ids on our events, delete imported events, and — if the person chooses — delete the dedicated calendar. Revoking access from Google's side is detected on the next sync and shown as "needs reconnecting".
- The connect screen says exactly what is shared each way and what is stored.

### Sync mechanics

- Phase 1: push on every create, change, and delete (after the save commits); a first full push on connect; retries with backoff; failures shown on the 設定 card, never blocking a save here.
- Phase 2: each read re-fetches a window of dates (a month back to six months ahead, repeating events expanded) and replaces what's stored for that calendar — right for deletions and repetition with no bookkeeping. Read on opening the calendar and every few minutes while it's open (at most every two minutes), and on 立即同步. Google's sync tokens and change notifications (channels renewed before they expire, about weekly) replace polling after deployment.
- **Imported events are personal**: only the person who connected sees them — not the workspace's other members — and they never link to projects.
- Tests use a fake Google Calendar, never a real account (as recorded model responses do for the AI, decision 0008).

## Alternatives considered

- **Keep only the subscription link.** No permission or review, but hours of delay, read-only, one-way.
- **Write into the person's primary calendar.** Familiar, but mixes our events with theirs, needs a broader permission (`calendar.events`), and makes disconnect messy.
- **Full two-way from the start.** Most of the complexity (conflicts, deletions, repetition) for a use we haven't seen yet.
- **Import via Google's secret iCal address.** No permission, but the person must find and paste a secret URL, and it polls, read-only.
- **Free/busy only for phase 2.** Least data, enough for clash warnings; a fallback if people don't want event titles stored here.
- **A sync service (e.g. Nylas, Cronofy).** Handles Google and Outlook, at a per-account cost and with a third party holding tokens. Worth revisiting if Outlook is requested.

## Consequences

- Google verification is on the path to launch for the calendar permission. Production can publish sign-in first and add the calendar permission when its verification is through, so one doesn't hold up the other.
- Phase 2 waits on hosting (a public HTTPS address) and the job queue.
- Background work and retries become product features, not internals: the 設定 card shows sync status.
- Outlook / Apple would be separate integrations; the connection table is provider-neutral so they can follow.

## Implementation notes (phase 1, 2026-10-05)

- `lib/calendar/google/`: `plan.ts` (pure: event → Google event; what to create, update, remove), `api.ts` (plain fetch, no SDK; `GOOGLE_CALENDAR_API_URL` points it at a fake in tests), `sync.ts` (one sync per connection at a time via a transaction-scoped advisory lock; a change mid-sync sets `dirty` and the sync goes around again).
- Triggered after every event save, archive, and delete, and after the intake review applies dates; 立即同步 runs it directly. Background work uses `after()` until the job queue exists (decision 0008).
- The calendar permission is requested with `access_type=offline` and `prompt=select_account consent` on that request only, so sign-in is unchanged and a refresh token is always returned.
- A failed push leaves the connection dirty, so it goes again on the next change or 立即同步; automatic retries with backoff wait for the job queue (launch checklist).
- A calendar deleted in Google is re-created on the next sync, with every event pushed again; an event deleted or edited in Google is restored from ours. Tracked in [tech-debt.md](../tech-debt.md) until phase 3.
- Unlinking the Google account (設定 → 以 Google 登入) removes the connection with it (the Google calendar stays, as Google keeps it).
- End-to-end tests run a second dev server (`NEXT_DIST_DIR=.next-test`, port 3001) with the stand-in Google sign-in and a fake Calendar API.

## Implementation notes (phase 2, 2026-10-05)

- `calendar_import_source` (a chosen Google calendar, per connection) and `external_event` (migration 0019); disconnecting removes both.
- `lib/calendar/google/import-plan.ts` (pure: a Google event as wall time plus zone; all-day ends on the last day covered) and `import.ts` (the windowed re-read, one per calendar at a time). A calendar removed from their Google list, or no longer readable, stops being shown.
- 設定 → 連結的服務 → Google 日曆 → 管理 → 在這裡顯示 asks for the two read permissions (with offline access) only when pressed, then lists their calendars (not our own) to tick.
- On the calendar, Google events are read-only: not draggable, no delete, open in Google when clicked, coloured by their Google calendar, and part of clash checks. The month view lists them on their own dates (an all-day event on each day it covers).
