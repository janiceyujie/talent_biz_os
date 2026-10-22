# Tech debt and known gaps

Shortcuts taken on purpose, and gaps we know about: what happens today, why it's acceptable for now, and what would fix it. Items needed before launch are in [setup/launch-checklist.md](setup/launch-checklist.md) instead; this list is for the rest. Remove an item in the change that fixes it.

## Calendar and Google

### Edits made in Google to pushed events are overwritten

**Today.** Events pushed to the 「Taloox」 calendar in Google are one-way. If someone moves, edits, or deletes one in Google, nothing comes back here, and the next push (any save here, or 立即同步) restores our version. The calendar's description in Google says to edit in Taloox.

**Why for now.** Decision 0009, phase 1: this app is the source of truth for project events, and two-way editing (conflicts, deletions that may be mistakes) is most of the complexity for a use we haven't seen.

**Fix.** Phase 3 of [decision 0009](decisions/0009-google-calendar-sync.md): read changes to pushed events back (by the `etag` already stored per event in `calendar_event_sync`), apply time and place changes here, and ask before applying a deletion. Start only if people actually edit project events in Google.

### Google events can't be attached to a project

**Today.** The person's own Google events are shown read-only; there's no way to make one part of a project.

**Fix.** "Adopting" as decision 0009 describes: create a project event here from the Google one and push it, leaving the original alone.

## Interface

### A toast can't be closed early while a dialog is open

**Today.** Toasts sit in the browser's top layer so they show above an open dialog, but a modal dialog makes everything outside it unclickable, the toast's × included. It still closes by itself after a few seconds.

**Fix.** If it matters: show the message inside the dialog when one is open.

## Intake

### HEIC photos can't be sent in

**Today.** Upload refuses HEIC/HEIF files with a hint to save them as JPEG first, and an email's HEIC attachments are listed by name rather than fetched (`lib/uploads.ts`). The iPhone camera saves photos as HEIC by default, so a photo of a paper contract taken on an iPhone and sent from a Mac is the likely case. iPhone screenshots are PNG and aren't affected.

**Why for now.** Anthropic and OpenAI list JPEG, PNG, GIF, and WebP as image inputs, not HEIC (not yet tried against either API); Gemini, which read it, was removed in decision 0022. Converting needs a new dependency: the prebuilt `sharp` usually can't decode HEVC-encoded HEIC, and a browser-side converter such as `heic2any` is large.

**Fix.** Convert to JPEG before the model sees it: in the browser on upload, or on the server for uploads and email attachments alike. Check first whether iPhone Safari already converts when the file picker doesn't list HEIC; if it does, only files sent from a Mac need it. Start if people ask for it or refused HEIC uploads show up.

## Assistant

### The assistant can't look anything up

**Today.** A question in the person's own words is answered from one fixed snapshot: the workspace overview or one project (decision 0023). A question about something outside it (money received last quarter, an archived project, the wording of an email) gets "that isn't in your data here".

**Why for now.** A model with tools that fetch data is the more flexible design, but decision 0007 says the model never gets tools, and an injected instruction could steer what it reads. A snapshot is bounded, testable, and cheap.

**Fix.** Read-only tools the model can call (projects, payments, a date range), scoped to the person's access, each call logged. It needs its own decision record amending 0007. Start when the questions people actually ask show the snapshot falling short.

### Someone with no workspace left can't reach their old conversations

**Today.** A person who loses access to a talent can read their conversations about it, read-only, from the Assistant page of another talent they work on (decision 0023). A person with no talent left is sent to onboarding and has no way to reach them, though they're still kept.

**Why for now.** Today a person works on one talent, so losing it means losing the app; a page outside any workspace would mean changing where sign-in sends people, for a case that barely happens yet.

**Fix.** A way to export one's own conversations from the account, outside any workspace, which data-protection rules also expect. Start with the manager's multi-talent view, or when someone asks.

