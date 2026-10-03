# 0004 — Execution work attaches only to signed projects

**Status:** Accepted (recorded 2026-10-03; decided while porting project phases)

## Context

Most offers never become work. If every inquiry could carry deliverables, travel, and payment requests, the calendar, reminders, and receivables would fill with things that may never happen, and "money owed to me" would include fees nobody agreed to. Meanwhile negotiation still needs to-dos of its own: replying to a message, following up.

## Decision

Projects move through three computed phases — 洽談 negotiation (`offer`, `negotiating`), 執行 execution (`signed`, `in_progress`), 結算 settlement (`collecting_payment`, `closed`); `declined` and `cancelled` are exits.

- **Communication to-dos** (`reply`, `follow_up`) are allowed at any stage.
- **Execution items** — deliverable, logistics, payment-due, and milestone to-dos; calendar events; payments; the deposit/balance split — can be linked only to a project that is signed (execution or settlement phase) and not archived.
- **The server enforces it** on every save, not just the UI (`lib/actions/project-link.ts`).
- **The rule applies when a link is made.** An item keeping the link it already has stays editable if the project later moves back to negotiation, so a stage change never locks data.
- Items linked to an unsigned or archived project don't produce notifications.
- Standalone to-dos, events, and payments need no project.

## Alternatives considered

- **No rule; let people link anything.** Simple, and what the first build did. Unsigned inquiries leaked into reminders and receivables.
- **UI-only gating.** Easy to bypass and easy to regress; the rule is about data integrity, so the server owns it.
- **Strict rule including existing links.** Moving a project back to 洽談中 would make its existing items uneditable — punishing a correction.
- **A "contract signed" event as the gate** instead of the stage. Many gigs never have a written contract; the stage is what the person controls.

## Consequences

- New linked item types must call the same check.
- A person who wants to plan travel before signing does it as a standalone event and links it after signing.
- Tests that create linked items must create a signed project first.
