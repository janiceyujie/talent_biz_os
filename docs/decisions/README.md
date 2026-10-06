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
| [0004](0004-execution-work-needs-a-signed-project.md) | Execution work attaches only to signed projects | Accepted |
| [0005](0005-language-neutral-template-placeholders.md) | Reply-template placeholders are stored language-neutral | Accepted |
| [0006](0006-model-provider.md) | Model calls go through one provider seam; a free model during development | Accepted |
| [0007](0007-untrusted-message-content.md) | Message content is untrusted: layered protection against prompt injection and fraud | Accepted |
| [0008](0008-ai-operations.md) | Running the AI features: testing, prompts, paid models, and usage limits | Accepted |
| [0009](0009-google-calendar-sync.md) | Syncing with Google Calendar: phases, permission, ownership, storage | Accepted |
| [0010](0010-per-person-preferences.md) | Per-person settings in a key–value table | Accepted |
