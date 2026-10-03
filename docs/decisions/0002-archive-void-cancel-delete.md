# 0002 — Archive, void, cancel, and delete are four different things

**Status:** Accepted (recorded 2026-10-03; decided during the payments work)

## Context

"Make this go away" means different things for business records, and the difference shows up in money. A project that's over should leave the day-to-day list but still count in last year's income. A payment typed twice should never have counted. A gig that got cancelled was real but won't be paid. Collapsing these into one "archived" flag made totals either hide real history or keep mistakes in them. The prototype first used "archive" for payments, then renamed it to 作廢 for exactly this reason.

## Decision

Four separate concepts, each with its own column and meaning:

| Concept | Where | Meaning | Counts in totals? |
|---|---|---|---|
| **Archive** (歸檔) | `archived_at` on projects, contacts, templates, files, events | A valid row hidden from day-to-day views; restorable | Yes — an archived project's payments still count |
| **Void** (作廢) | `payment.voided_at` | Entered by mistake or duplicated; it never happened | No — out of every total and chart, but viewable and restorable |
| **Cancelled** (已取消) | `payment.status = 'cancelled'` | A real payment that won't happen (e.g. the gig was cancelled) | No longer outstanding; stays in history |
| **Delete** | — | Only when the user asks; removes rows and stored files for good | — |

Payments have no archive: past months need no hiding, they're a date filter. Archiving a project never voids its payments.

## Alternatives considered

- **One `archived_at` for everything, including payments.** What we had first. A voided duplicate and a paid-but-old invoice looked the same, so either totals dropped real income or kept mistakes. Renamed to `voided_at` (migration 0008).
- **Soft delete (`deleted_at`) as the only flag.** Same collapse, plus "deleted" suggests the data is gone when it isn't.
- **Hard delete for mistakes.** Loses the audit trail; restoring a wrongly voided entry is common enough to keep.

## Consequences

- Every summary must filter `voided_at is null` and decide how to treat `cancelled` — they're not interchangeable.
- UI copy has to keep the words apart: 歸檔 / 作廢 / 已取消 / 刪除, and their English equivalents.
- Adding another "hide" flag later needs a new record, not a reuse of one of these.
