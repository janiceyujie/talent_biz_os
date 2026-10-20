# 0018 — Anything can go on an open deal; only signed work counts

**Status:** Accepted (2026-10-20). Supersedes [0004](0004-execution-work-needs-a-signed-project.md).

## Context

Decision 0004 let only signed projects take new linked events, execution to-dos, and payments, so that inquiries that never become work wouldn't fill the calendar, reminders, and "money owed to me". The cost showed once events came from Google Calendar (decision 0017): a call or a venue visit during negotiation, or a date on hold for a show, couldn't be put on the deal it belongs to, and a workspace with no signed project could link nothing at all. Money moves before signing too: travel to a pitch, a test shoot, samples (often), a deposit to hold a date (common for live work). Under 0004 those were recorded with no project, so a lost deal never showed what it cost to chase, and a deposit meant moving the stage to Signed first.

0004's worry was about what's *counted*, not what's *linked*: income totals and forecasts including fees nobody agreed to, reminders about work that may never happen, and bank notices matched to an unagreed fee. Deal trackers that people know (HubSpot, Salesforce, Pipedrive) let anything go on a deal at any stage and protect the numbers where they're counted.

## Decision

- **Anything can be linked to a deal that's still going**: events, to-dos, and payments, at any stage before or after signing, as long as the project isn't archived, declined, or cancelled (`isOpenStage`, `lib/actions/project-link.ts`). The server still checks every new link. An item keeping the link it already has stays editable whatever the stage, as before.
- **Only signed work counts** (`countedPayments`, `lib/domain/workflow.ts`):
  - money still **expected** counts in Finance's receivable and payable, Today's money, a client's outstanding, payment reminders, and bank-notice matching only for a signed deal or with no project;
  - money that **moved** (received or paid) always counts, whatever the stage: it's a fact;
  - reminders for events and to-dos already left out unsigned deals, and still do.
- **A deal that's lost cleans up when asked.** Marking a deal declined or cancelled with things still open on it (expected payments, its plan's to-dos, events still ahead) asks once whether to cancel them. Yes cancels them: payments become Cancelled, to-dos are dismissed, events are cancelled and leave Google Calendar. Money that moved, past events, and reply and follow-up to-dos stay. No keeps them, and they no longer count anyway. With nothing open, the stage just changes.
- **The intake's proposals are unchanged.** It still proposes payments only for signed deals, and keeps a negotiated deal's dates on the project until it's signed. That's about what the AI suggests, not what a person may add.

## Alternatives considered

- **Keep 0004.** Simplest, but it blocks what people expect from a deal tracker, and money that moved before signing has nowhere to go.
- **Open only events.** Fixes the calendar, but pitch costs and deposits still can't go on the deal.
- **Open recorded money and events, keep expected payments and deliverables signed-only.** Smaller, but the line between what may and may not be added is hard to explain, and counting by stage protects the numbers anyway.

## Consequences

- Every total, reminder, and match on expected money must go through `countedPayments`. A new one that reads payments directly would count unsigned fees again.
- Income on a deal still being negotiated shows in money received, which is correct, since it's real money.
- A deal left declined or cancelled with its items kept still lists them on the project, uncounted.
- Changing a project's stage in its full edit form doesn't ask the lost-deal question; the ⋯ menu does. Its items stay, uncounted.
