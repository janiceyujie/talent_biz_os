# Tech debt and known gaps

Shortcuts taken on purpose, and gaps we know about: what happens today, why it's acceptable for now, and what would fix it. Items needed before launch are in [setup/launch-checklist.md](setup/launch-checklist.md) instead; this list is for the rest. Remove an item in the change that fixes it.

## Calendar and Google

### Edits made in Google to pushed events are overwritten

**Today.** Events pushed to the 「Talent Biz OS」 calendar in Google are one-way. If someone moves, edits, or deletes one in Google, nothing comes back here, and the next push (any save here, or 立即同步) restores our version. The calendar's description in Google says to edit in Talent Biz OS.

**Why for now.** Decision 0009, phase 1: this app is the source of truth for project events, and two-way editing (conflicts, deletions that may be mistakes) is most of the complexity for a use we haven't seen.

**Fix.** Phase 3 of [decision 0009](decisions/0009-google-calendar-sync.md): read changes to pushed events back (by the `etag` already stored per event in `calendar_event_sync`), apply time and place changes here, and ask before applying a deletion. Start only if people actually edit project events in Google.

### Google events can't be attached to a project

**Today.** The person's own Google events are shown read-only; there's no way to make one part of a project.

**Fix.** "Adopting" as decision 0009 describes: create a project event here from the Google one and push it, leaving the original alone.

## Interface

### A toast can't be closed early while a dialog is open

**Today.** Toasts sit in the browser's top layer so they show above an open dialog, but a modal dialog makes everything outside it unclickable, the toast's × included. It still closes by itself after a few seconds.

**Fix.** If it matters: show the message inside the dialog when one is open.
