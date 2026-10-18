# Assistant routing and submission fix

The formal local assistant had not carried over the prototype's lookup router,
optimistic sent-message display, or four quick prompts. A recorded `testing`
request went to Luna with the preceding receivables exchange and returned another
financial summary. The record establishes the incorrect output; it does not
establish the model's internal reason for choosing that answer.

## Behavior

- Show the user message immediately, clear the composer, and show a separate
  assistant loading bubble. A synchronous guard prevents duplicate submissions.
- Keep failed messages visible, restore the draft, and offer retry without
  duplicating the failed bubble or passing failed requests as model history.
- Restore the prototype's Today, Tomorrow, Receivables and Payables shortcuts.
  Clicking one submits it immediately.
- Route exact supported greetings, connection tests, date-specific schedule
  queries and pending payment lookups locally, before checking paid AI allowance.
- Match complete supported phrases, not isolated keywords. Mixed, filtered,
  interpretive and unsupported requests remain model requests.
- Preserve authenticated workspace and selected-project scoping. No business
  data writes or schema changes. Sample data remains synthetic and isolated.
- Store local answers in the existing account-scoped history, with local mode,
  zero model tokens and zero API cost. Existing records remain compatible.
- Reinforce the model instruction to answer the latest question and not turn
  reference context or earlier answers into unsolicited financial summaries.

This ports the requested read-only behaviors, not every prototype feature.
Voice input, entry confirmation forms, travel helpers and partner-history
analysis are not introduced by this change.

## Validation

- 95 tests passed, including new routing, mixed-query, scoping, payment and
  date/completion filtering regressions.
- TypeScript, translation checks and production build passed.
- Lint: zero errors, three pre-existing warnings in unrelated files.
- Live Chrome: `testing` returned a local acknowledgment with zero usage in the
  same conversation that previously produced the incorrect financial answer.
- Live Chrome: payment and today's schedule shortcuts returned recorded sample
  data with local mode and zero usage; disk records confirmed persistence.
- Two synthetic live model checks returned an explanation and a draft with
  usage recorded (684 and 834 tokens; total estimated USD 0.000221).
- Native browser snapshots completed after the fast model responses; the
  intermediate loading state was not captured visually. Its updates occur before
  awaiting the action. The user changed browser tabs during the final reload
  check, so reload persistence was not rechecked in this turn.
- No Git commit, push, deployment, migration or real mailbox access.
