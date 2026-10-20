# 0017 — Two-way Google Calendar: edits made in Google come back

**Status:** Accepted (2026-10-20). Changes [0009](0009-google-calendar-sync.md): its phase 3 starts now, and its "made here → owned here" rule becomes shared ownership, field by field. Design: [calendar-two-way](../design/calendar-two-way.md).

## Context

Decision 0009 pushes our events one way, to a calendar we create in the person's Google account. A change made there is put back by the next push, and the calendar's description warns about it. Phase 3, edits made in Google coming back, was deferred "only if people actually edit project events in Google".

People do edit there, and they expect it to stick. Tools whose events live in your calendar treat two-way sync as the norm (Motion, Reclaim, Sunsama, HubSpot): drag a block in Google, and it moves in the app. An edit that quietly reverts feels broken. Moving a show or renaming a meeting in a phone calendar is often quicker than opening the app.

The forces against it:

- **Project data is confirmed fact here.** Nothing the AI reads becomes fact without a person, and we don't want a phone swipe to remove an event and its history.
- **Some fields are composed** from several of ours (a travel route, a stay's hotel and address, the description's project and seat lines), so a change there can't be read back reliably.
- **The app has no repeating events.**
- **Each teammate has their own copy** of the talent's calendar.

## Decision

Our events are **shared with Google**. A change in either place simply appears in the other, whoever made it, with nothing to review or resolve on screen.

- **Edits in Google apply here right away.** They're a person's own action, not the model's, so "a person confirms" already holds.
- **Deletes in Google remove the event from every screen here.** This reverses 0009's "in phase 3 it would ask here first". Out of sight, the event is kept for 30 days before it's removed for good, so a Restore can be added later and an accidental delete recovered by asking.
- **Changed in both places: merged silently, field by field**, so both changes survive. On a field both sides changed, the most recent wins. The merge compares each field with what we last pushed.
- **No change history, Undo, conflict notice, or Restore on screen**, for now. People don't remember which field they changed where. Every change is still recorded in `audit_log`, so a history or Restore can be added when people ask.
- **What comes back:** title, date, time, and end; the location where it's a single field; notes, from below a marked line in the description. Times come back as the same moment, in the event's own zone; a new event from Google takes the workspace's zone. Google's screen attaches the viewer's zone (the Google account's) to what it saves, so that zone is never taken.
  - An end changed in Google comes back for every event; every kind can already have one here. With none, it goes to Google as one hour.
  - Composed fields stay ours. A change to one of those in Google is replaced by ours at the next sync.
- **Events added in Google** to our calendar appear here right away, marked as not in a project. The Calendar screen lists every event without a project, with Add to a project. That list shows all the talent's open projects, with a matched one first, marked "Suggested", when one is clear. The match runs in code: an invited address matching a contact on exactly one project first, then exactly one project named in the title; otherwise none. Invited addresses are read for that match only, never stored.
- **Repeating events added in Google** show read-only, like the person's other Google calendars (0009, phase 2). One made in our own calendar can be added to a project as a whole series: every occurrence then shows the project; unfiled, each carries "Not in a project". The person's other calendars stay personal. If one of our events is made to repeat there, only its first occurrence is kept here.
- **An edit in any teammate's copy** changes the shared event; the next push updates every other copy. A change is recorded as that connection's person's, from Google Calendar.
- **How quickly:** the worker reads each connection's changes every 5 minutes with Google's sync tokens. Once deployed, Google's change notices trigger the read within seconds, and the 5-minute read becomes a 30-minute safety net.
- **No new permission.** `calendar.app.created` covers reading events on calendars this app created; nobody reconnects.

0009's other rules stay. The dedicated calendar is the only one we write. The person's other calendars are read-only. Deleting or archiving here removes the Google copy.

## Alternatives considered

- **Keep one-way (0009 as it was).** The safest for project data, but it undoes people's own edits, which is the most common surprise in calendar sync.
- **Every change from Google goes to Intake for review.** Nothing changes until it's confirmed. It's safe, but a drag that doesn't stick isn't what two-way means.
- **Show each change, with Undo, conflict notices, and Restore.** Considered and designed first. It turned out to put details in front of people that they don't remember making, field by field. The record is kept, so any of it can come back later.
- **The most recent change wins for the whole event.** Simpler, but one side's unrelated edit would quietly disappear. Per-field merging keeps both, unseen, and it's cheap because each push already records what was written.
- **Read composed fields back by parsing them.** "Taipei → Tokyo, seat 12A", once edited, can't always be split back. A wrong guess would corrupt travel data, so those fields stay ours.
- **Each occurrence of a repeating event as its own event.** That's 26 events for a weekly lesson, and series edits can't map back. Filing the series as a whole, read-only, gives a weekly rehearsal its project without that.
- **A model to suggest the project.** It handles vague titles, but means a call per event, with cost and a delay, for a match that people and names make clear.
- **A plain list of projects, no suggestion.** Simplest, but the same list with the likely project first costs the person nothing more to read.

## Consequences

- **Data:**
  - a sync token per connection and per chosen calendar;
  - a snapshot of what we last pushed, per event;
  - a hidden mark for events deleted in Google;
  - new `audit_log` actions, recorded and not shown.
  - The design lists them.
- **The calendar's own description** in Google changes from "edits made here are overwritten" to say they come back. Existing calendars are updated at their next sync.
- **A delete made by accident in Google** removes the event from every screen. Until Restore exists, it can only be recovered by support within 30 days.
- **A composed field edited in Google** (a travel route, say) silently goes back to ours, as it does today.
- **Conflicts are rare but real.** The window is minutes wide before deploy and seconds after, and the merge keeps both sides' fields.
- **Watch for:**
  - questions like "my event moved" or "my event disappeared", which mean people need the history or Restore;
  - composed fields edited in Google and reverted, which shows in `audit_log`. If it's often, revisit which fields are composed.
