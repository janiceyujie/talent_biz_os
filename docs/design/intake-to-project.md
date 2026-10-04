# Design: from 進件 to 合作案

**Status:** Agreed direction (2026-10-04); open questions below. Mockup: [進件 → 合作案 flow](https://claude.ai/artifact/XKBXdxJ8cNEmqRb27Vk6sV) (private; open it from the owner's account or share it from its page).

## The problem

Today a message comes in, the AI analyzes it, and the inbox shows the analysis as a table of facts next to the original. People can read their own messages, so the table mostly repeats what they already see. The value we add is the step after reading: **turning what a message says into changes to the person's records** — the project, its contact, its money, its to-dos — without retyping, and without anything happening unconfirmed.

Two actions exist today, and only one does real work:

- **建立新合作案** fills the project form from the analysis. Good, but it's a form, not a review, and it ignores the contact, the to-confirm list, and dates that belong on the project.
- **加到既有合作案** only links the message (plus a reply to-do). The message's content — a new fee, a changed time, a payment received — goes nowhere.

## The journey

A message arrives: an offer, a counter-offer, a confirmation, a contract, a schedule change, a payment notice. The person wants to:

1. **Understand** what the other side wants, and what's still open.
2. **Keep the deal current** without retyping: the fee, the date, the terms, the money.
3. **Not miss what's due**: replies, signatures, payments.
4. **Reply** (drafting is the next feature, and uses everything above).

Every message belongs to a new deal or an existing one. That choice comes first; everything else follows from it.

## The model: a message proposes changes; the person accepts them

Three steps, shown on one screen.

**1. Target — which project is this?** The AI proposes one, with its reasons ("same contact Maya, same date 11/14"). The person keeps it, picks another, or chooses a new project. Signals, strongest first: the person picked it explicitly (Gmail add-on, later); same email thread; a known contact (email, then name or company); the same date, venue, or title; later, embedding similarity. A match is always a suggestion.

**2. Proposed changes — what this message changes.** A checklist. Each item shows **current → proposed**, the exact words it came from, and anything the AI assumed. Every proposed value is editable in place — a fee, a length, a date, an amount received — so the person corrects it right there, then ticks it. A tick applies the value as edited.

**3. Apply.** One button applies the ticked items in a single transaction, files the message under the project, and records what changed in the audit log. The project's timeline then shows the message and exactly what it changed.

Who decides what:

- **The AI extracts** facts and proposes a target. That's all.
- **Code decides what changes to propose**, from the message's intent, the extracted facts, and the project's current state. It's deterministic, testable, and can't be talked into anything by a message (decision 0007).
- **The person confirms** every change. Nothing is applied by itself.

## What "create a new project" means

The proposal is a project plus what comes with it, reviewed together:

- **The project**, prefilled and editable: title, type, stage (待確認), counterparty, quote and tax, the type's fields (venue, set length, deliverables, usage rights…), dates. Dates are kept on the project; they become calendar events once it's signed (decision 0004).
- **The contact**: link an existing one, or create one from the sender's name, company, email, and phone.
- **A reply to-do** with the reply-by date (confirmed in the form).
- **The to-confirm list** (需向對方確認), saved on the project for the reply draft to ask about.

## What "add to an existing project" means

Not just attaching the message: **applying what it says to that project**. What's proposed depends on the intent.

| Intent | Proposed changes | Default |
|---|---|---|
| **Inquiry** (a second offer for the same project) | Fill fields the project doesn't have yet | Ticked |
| **Negotiation** | Fee, date, length, terms the other side proposes, as current → proposed | **Unticked**: a proposal isn't an agreement. Recorded on the timeline either way |
| | Stage 待確認 → 洽談中 | Ticked |
| **Confirmation** | The agreed terms (fee, date, length) | Ticked: they're agreed |
| | A to-do "wait for the contract" when one is promised | Ticked |
| | Stage → 已簽約 | **Asked, never defaulted**: "對方已確認，但還沒有合約。要把階段改為已簽約嗎？" — move now, or keep 洽談中 until the contract. Many gigs never have a written contract, so the person decides. Moving it reveals what signing unlocks (calendar events, deposit and balance) as further items |
| **Contract** | "Add contract version v2", compared field by field with the previous version or the offer | Ticked when the AI reads the file as a contract; unticked, the file is kept as an attachment only. A rider, a quote sheet, or a duplicate doesn't become a version |
| | Stage → 已簽約 when it's signed | Ticked if the contract says signed |
| **Logistics** | Times, place, travel; calendar events if the project is signed (else saved on the project) | Ticked |
| **Payment** | Match an expected payment: 待收 → 已收 with the date and the amount received; a shortfall shown (often withheld tax) | Ticked when exactly one payment matches; else pick |
| | An invoice request → to-do "send invoice"; a reminder → a note on the payment | Ticked |
| | Last payment received → stage 已完成 | Ticked |
| **Cancellation / postponement** | Stage → 已取消, or the new date; a cancellation-fee payment | Ticked |
| **Any** | Reply to-do: the stated reply-by date, or, when none is stated, the person's default from 設定 ("reply within N days of receiving"); the date is editable for this message | Ticked |
| | File the message on the project's timeline | Always |
| | To-confirm items not yet answered | Merged into the project's list |

A field the message doesn't mention is never proposed. A value equal to the current one is not shown.

## The screens (see the mockup)

1. **Inbox, message selected**: a two- or three-line summary, the original collapsed, and "這則訊息屬於哪個合作案？" with the suggested project, "new project", and "another project".
2a. **Existing project**: the change checklist on the left; the project as it is now on the right. "套用 N 項更新", "套用並擬回覆".
2b. **New project**: the editable proposed project, then the contact, the reply to-do, and the to-confirm list as tickable extras. "建立合作案", "建立並擬回覆".
2c. **Payment**: the matched expected payment, the amount and date received (editable), and the shortfall.
2d. **Confirmation without a contract**: the newly fixed details as items, and the stage question with its two answers.
3. **Project after applying**: a timeline of messages, each with what was applied and what was left as a proposal.

The facts table goes away; the summary stays short. Flags (decision 0007) stay at the top.

## Data

- **Proposals aren't stored.** They're computed when the screen opens, from the latest analysis and the project's current state, so they're never stale: if the project changed after the analysis, the proposal reflects it.
- **What was applied is stored** in `audit_log` (action `message.applied`, details: the message, each changed field with before and after, items left unticked). The timeline reads the project's messages plus these entries.
- **New**: a contract version table when contracts arrive (designed in the architecture doc); `project.to_confirm` (or a small table) for the to-confirm list; a reply-by default in settings (`person.reply_within_days`, editable per message); the payment fields already exist (`settled_amount`, `settled_on`).
- **Matching** reads contacts, projects, and payments for the talent only.

## Edge cases

- **Two messages change the same field**: each proposal compares against the project as it is when opened, so the second sees the first's result.
- **Stage going backwards** (a cancellation after signing): allowed, with the reason on the timeline; items already linked keep their links (decision 0004).
- **A payment amount that doesn't match any expected payment**: offer "record as a new payment" instead of guessing.
- **The wrong target**: "換一個合作案" recomputes the proposals for the new target before anything is applied.
- **Re-analysis after applying**: shows a new proposal against the updated project; nothing is undone automatically.

## Decided (2026-10-04)

- **Proposed values are editable** in the checklist; a tick applies the edited value.
- **A confirmation without a contract doesn't move the stage**; the screen asks, and the person chooses.
- **No reply-by stated**: the person's default from 設定 ("收到後 N 天") fills the date, editable per message.
- **Contract versions**: a file the AI reads as a contract is proposed as a new version (a ticked item); unticked, it's just an attachment. No separate marking step.

## Open questions

1. How strongly should the AI suggest other stage changes? Proposed: only the moves in the table; judgment calls (signing) are asked, not ticked.
2. Should accepting a counter-offer from this screen also start a reply ("套用並擬回覆")? Likely yes, once drafting exists.
3. Where the reply-by default lives: per person, or per workspace (a manager's team)?

## Build order

1. Target suggestion and the per-intent change rules, as pure functions with tests (no model calls).
2. The review screen for existing projects (negotiation, confirmation, logistics, payment), then new projects (contact and to-confirm list).
3. The project timeline.
4. Contract versions and their comparison.
5. Then reply drafting, which reads all of the above.
