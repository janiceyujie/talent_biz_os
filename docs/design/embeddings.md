# Design: embeddings, later

**Status:** Planned, not built. Nothing uses embeddings today: what's work is decided by rules, then a language model reading metadata ([decision 0013](../decisions/0013-connected-gmail-mailbox.md)); which project a message belongs to, by rules on threads, contacts, dates, and venues (`suggestTargets` in `lib/domain/intake.ts`). This page records what we'd use embeddings for, the rule that bounds them, the data we collect meanwhile, and when to start.

## What they'd be for

| Use | Today | With embeddings |
|---|---|---|
| **Which project** a message belongs to | Rules: the same thread, a known contact, a date, venue, or title the project already has | A fallback for what the rules don't settle: the message's summary compared with each open project's, the closest above a threshold proposed. Most useful once an artist has many open projects with similar people and dates |
| **What's work** in the mailbox | Rules, then the relevance model on sender, subject, Gmail tab, and preview | Each artist's own examples of work and not work, compared with a new email: cheaper per email than a model call, and it learns that artist's mail. Run beside the model first (shadow), switched on per artist only when it does better |

Search across messages and projects could use the same vectors; it isn't planned.

## The rule that bounds this

Gmail data is under Google's Limited Use requirements (Workspace API user data policy). They forbid "using user data to create, train, or improve a machine learning or artificial intelligence model … beyond that specific user's personalized model for the appropriate use case or user-facing feature", and they apply to data derived from it too: vectors made from email, and labels tied to it.

So:

- **Per artist account (talent) only.** An artist's examples and vectors decide only that artist's mail and projects. Never one model, index, or set of examples shared across artists, and never a model trained on everyone's mail.
- **For a feature people see.** Sorting their mail, suggesting a project. Not analytics, not anything else.
- **Shared parts learn from made-up data only.** Prompts, rules, and anything common to everyone are tuned on invented cases (`evals/`), as today. Aggregate rates (how often Not work is pressed) may tune thresholds as internal operations; confirm that in Google's review (CASA) before relying on it.
- **A provider that keeps nothing.** Vectors are computed by a provider only to provide the feature, with no training on what it's sent, in development too (decision 0022).
- **Deleted with the mailbox.** Vectors and examples from Gmail go when the mailbox is disconnected or the talent is deleted, like the rest of its data.
- **Only mail brought in.** Filtered out mail's body is never read; it isn't read to make a vector either.

Pasted and uploaded messages aren't Google data, but they're still the person's: the same per-artist rule applies, and anything wider needs our own privacy terms and their consent.

## Collecting now

Embeddings need labelled examples: what the system decided, and what the person decided. Ids and outcomes only, never a sender, subject, or body.

| Data | Where | Status |
|---|---|---|
| The model's score and kind for each email it scored, with the rules, prompt, and model versions | `mail_decision.score`, `kind`, `classifier_version` | Collected |
| The person's corrections: This was work, Not work, Not sure resolved, sender rules | `mail_decision.outcome`, `decided_by = person`; `mail_sender_rule` | Collected, but a correction overwrites `decided_by`: **which rule or model decided first is lost** |
| Where each message was filed | `message.project_id`, with its analysis (`message_analysis`) | Collected |
| **What was suggested** when a message was filed (the top suggestion, and whether it was taken) | — | **Not collected** |
| Cost and volume of scoring | `ai_call` (role `relevance`) | Collected |

Two small changes keep the labels worth having, worth doing well before embeddings themselves:

1. **Keep the first decision.** When the person overrides one, keep who decided before (a rule's id, or the model) next to their verdict, so "the system said X, the person said Y" survives.
2. **Record the suggestion.** When a message is filed, record the top suggested project and the one chosen (ids only).

Both touch the database, so they go on their own branch, with the design reviewed first.

Labels from Filtered out mail are kept as long as the decision is: 90 days. An email's vector, if ever needed for one of those, can only be made while the mailbox is still connected, by reading its metadata again from Gmail.

## When to start

Starting values, to revisit with real use:

| Use | Start when |
|---|---|
| Which project | Artists commonly have about 10 or more open projects, **and** the person picks something other than the top suggestion, or there's no suggestion, for more than about 1 in 5 messages filed. Needs change 2 above to measure |
| What's work | The relevance model's cost matters at our volume (`ai_call`), **or** corrections show misses: This was work pressed often in Filtered out. And an artist has enough corrections of both kinds to compare against, on the order of 50. Needs change 1 above |

Before either, nothing needs building: no vector store, no provider.

## Then

1. Turn on pgvector in Supabase; a table of vectors keyed by talent, with the model and its version, deleted by cascade with the talent or mailbox.
2. An `embedding` role in `lib/ai/model.ts`, logged in `ai_call` like every call. OpenAI's embedding models first: OpenAI is already the backup provider ([decision 0015](../decisions/0015-production-model-providers.md)), so no new vendor, key, or data terms. Check the current models and price then.
3. An eval of made-up cases, in Traditional Chinese and English, for each use (`evals/`, as `evals/relevance`).
4. Shadow mode: compute and compare, change nothing on screen; switch on per artist when it beats what's there.
5. A decision record for what's chosen, and the architecture doc and system map updated.
