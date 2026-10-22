# 0019 — Match a message to its project through who it's from, not through past messages

**Status:** Accepted (2026-10-20)

## Context

When the person opens a message waiting for review, the intake suggests which project it belongs to (`suggestTargets`, `lib/domain/intake.ts`) and ticks the best one. It runs in the browser and scores every live project on the thread, the sender, dates, identifying details (venue, brand, campaign), an expected payment's amount, and the title.

Two of those signals read past messages: "an earlier message from this sender is filed on this project", and dates that earlier messages on a project mentioned. To have them, the layout sent the newest 200 messages to every page. Decision 0011 moved Intake's list to pages, and this was the last thing still needing the history. Keeping it means either a cap or a list that grows forever:

- **A cap misses.** With the newest 200 filed messages, a deal still running whose partner last wrote 200 messages ago loses the signal, without saying so.
- **No cap grows with the account.** Limiting it to projects that aren't archived doesn't bound it either: a person who never archives keeps every project live, and a partner of many years has many projects.

A long-term partner is also the case the scoring handles worst. Their email is on all their projects, so each one gets the same points for "who"; with nothing else in the message to tell them apart, the first of several equal projects is ticked, which is a guess.

How CRMs do it (October 2026):

- **Pipedrive** links an email to a deal only when the participant's contact has exactly one open deal; with several, it asks the person to pick. A deal that's won or lost stops taking new email automatically, and a thread stays with one deal.
- **Salesforce** (Einstein Activity Capture) matches sender and recipient addresses to Contacts and Leads, then a configurable flow relates the email to their Accounts and Opportunities.
- **HubSpot** relates an email to the contact's five most recently associated deals. Users with long-term contacts report emails landing on unrelated deals, and the rule can't be turned off.

None of them scans past email to decide. They resolve the participant to a record they keep (a contact and the deals it's on) and look that up by an indexed key. The ones users trust don't guess when the answer is ambiguous.

## Decision

**Matching runs on the server and reads relationships, not message history.** Opening a message returns its suggestions with it (`GET /api/inbox/[id]`); the browser no longer has filed messages to compare. The scoring stays a pure function, run on the server over:

- the thread (a message in the same email thread already filed on a project);
- who it's from, resolved through the projects' contacts and a record of who the person corresponds with on each project (below), looked up by email;
- the talent's live projects, for dates, identifying details, expected payments, and the title, as now. These grow with projects, not messages.

**Who the person corresponds with on a project is recorded, every time a message is filed** (`project_correspondent`: project, the other side's email, their name, when they last wrote, how many messages). It's separate from contacts: the person still decides who becomes a contact (decision 0013), and the record is kept whether they do or not.

- A received Gmail email records its sender, from the header.
- The person's own reply records its recipients: they're who the person is talking to.
- A pasted or uploaded message records the email the analysis found in it, when there is one. That's the message's claim (decision 0007); here it only adds a hint to a suggestion the person confirms.
- Bank and payment-app notices record nothing: the bank isn't the other side of the deal.
- The three places a message is filed write it: applying a review, creating a project from a message, and filing a thread. Existing filed messages are backfilled by the migration.

**Scoring and the pre-ticked choice:**

- **"Who" counts once.** The project's contact, its correspondents, or a matching name or company: the highest applies, not their sum.
- **Recency orders, it doesn't score.** Among projects with equal points, the one whose correspondent wrote most recently comes first. It never makes a project lead.
- **The top suggestion is ticked only when it clearly leads:** at least 3 points ahead of the next (one more piece of evidence, such as a matching date), or it's the only one. Otherwise the suggestions are listed with none ticked, and the person picks.
- Unchanged: the thread is worth 10, ended projects lose 2 except for a payment, a project needs 3 points to be suggested, and at most three are shown.

**Dates earlier messages mentioned** but the project doesn't keep are no longer a matching signal. They still inform the proposal for a project once it's chosen: they come with the project's detail (`/api/projects/[id]`), which covers that one project's filed messages.

## Alternatives considered

- **Compare with every filed message in the database at match time.** Nothing to keep in sync, and the browser receives only results. But the work per message opened grows with the account's history for good, and the long-term partner still ties.
- **Always add the sender as a contact on the project when a message is filed.** No new table, but every sender becomes a contact, which takes the choice away from the person (decision 0013) and fills the contact list.
- **Keep matching on contacts only.** Simplest, but the signal disappears whenever the person declines to add a contact, and there's no "last wrote" to order by.
- **Keep the newest 200 filed messages.** What `main` did; it misses old partners silently.
- **Always tick the top suggestion, ordered by recency.** Fewer clicks, but with a long-term partner it ticks a guess, the HubSpot problem.

## Consequences

- A new table, `project_correspondent`, with a migration that backfills it from filed messages. Every new way of filing a message must write it; a missed one doesn't break anything, it only loses a hint.
- Messages from a long-term partner with nothing else to tell their projects apart now ask the person to pick, where they used to be ticked: one more click, instead of a wrong project.
- Opening a message costs a little more on the server (its suggestions), and the review screen no longer needs every project's contacts and payments to suggest, a step toward projects leaving the layout (decision 0011, step 3).
- Correspondents aren't removed when a message moves or a project's contacts change. A stale one adds at most a hint, and the person confirms every suggestion.
- The record holds email addresses and names of people the talent works with, like contacts do, scoped to the workspace and deleted with the project.
