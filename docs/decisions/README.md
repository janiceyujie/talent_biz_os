# Decision records

Small but load-bearing decisions, one file each: what we chose, why, what else we considered, and what we gave up.

`docs/architecture.md` stays the source of truth for **what the system does now**. A record here keeps the **why**, which the architecture doc shouldn't carry. When a decision shapes behavior, the architecture doc states the behavior in a line and links the record.

## When to write one

When a choice is easy to get wrong later, was argued over, or trades something away — security trade-offs, data conventions, things a future change would quietly undo. Not for routine implementation choices.

## Format

`NNNN-short-title.md`, numbered in order, never renumbered. Sections:

- **Status** — Proposed, Accepted, or Superseded by NNNN (records aren't deleted; a reversal is a new record).
- **Context** — the problem and the forces on it.
- **Decision** — what we do, specifically enough to check an implementation against.
- **Alternatives considered** — and why not.
- **Consequences** — what this costs, what follows from it, what to watch.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-sign-in-methods-and-account-linking.md) | Sign-in methods and account linking | Accepted |
| [0002](0002-archive-void-cancel-delete.md) | Archive, void, cancel, and delete are four different things | Accepted |
| [0003](0003-scheduled-times-as-local-time-plus-zone.md) | Scheduled times are stored as local time plus zone, not UTC | Accepted |
| [0004](0004-execution-work-needs-a-signed-project.md) | Execution work attaches only to signed projects | Superseded by 0018 |
| [0005](0005-language-neutral-template-placeholders.md) | Reply-template placeholders are stored language-neutral | Accepted |
| [0006](0006-model-provider.md) | Model calls go through one provider seam; a free model during development | Accepted; production providers in 0015, development in 0022 |
| [0007](0007-untrusted-message-content.md) | Message content is untrusted: layered protection against prompt injection and fraud | Accepted |
| [0008](0008-ai-operations.md) | Running the AI features: testing, prompts, paid models, and usage limits | Accepted |
| [0009](0009-google-calendar-sync.md) | Syncing with Google Calendar: phases, permission, ownership, storage | Accepted; two-way editing in 0017 |
| [0010](0010-per-person-preferences.md) | Per-person settings in a key–value table | Accepted |
| [0011](0011-pages-fetch-what-they-show.md) | Pages fetch what they show; the layout carries only what every page needs | Accepted |
| [0012](0012-companies-and-their-roles-on-projects.md) | Companies, their people, and their roles on projects | Accepted |
| [0013](0013-connected-gmail-mailbox.md) | Reading the connected Gmail mailbox, metadata first | Accepted |
| [0014](0014-hosting-and-job-queue.md) | Singapore on Supabase and Render, with Graphile Worker as the job queue | Accepted |
| [0015](0015-production-model-providers.md) | OpenAI and Anthropic in production, one primary and one backup | Accepted; free tier removed in 0022 |
| [0016](0016-mailbox-tokens-and-key-management.md) | Mailbox tokens: envelope encryption with Cloud KMS | Accepted |
| [0017](0017-two-way-google-calendar.md) | Two-way Google Calendar: edits made in Google come back | Accepted |
| [0018](0018-anything-on-an-open-deal.md) | Anything can go on an open deal; only signed work counts | Accepted |
| [0019](0019-match-messages-by-relationships.md) | Match a message to its project through who it's from, not through past messages | Accepted |
| [0020](0020-document-templates-are-data.md) | Contract and quote templates are data, published on deploy and generated on the server | Accepted |
| [0021](0021-payment-receipts.md) | Money received is a list of receipts, and a payment's total is worked out from them | Accepted |
| [0022](0022-paid-providers-only.md) | Only the paid providers, in development too | Accepted |
| [0023](0023-talent-assistant.md) | The assistant: personal conversations over a fixed, read-only snapshot | Accepted |
