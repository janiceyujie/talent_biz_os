# Evals

Checks of AI behavior against cases with known answers. Run one before and after changing a prompt, a field definition, or the model, and compare.

## Extraction (`npm run eval:extraction`)

`extraction/cases.ts` holds made-up messages — every name, address, and number is fictional — each with the facts a correct extraction must contain. `scripts/eval-extraction.mts` runs them through `lib/ai/extract.ts`, the same function the app uses, and scores each expected field.

```
npm run eval:extraction                                  # the primary provider from .env.local
npm run eval:extraction -- --provider openai             # another provider, its model per role
npm run eval:extraction -- --only gig                    # cases whose id contains "gig"
npm run eval:extraction -- --locale en                   # the person's language (default zh-TW)
npm run eval:extraction -- --pause 2000                  # milliseconds between calls, for a low rate limit (default 0)
```

Every case also checks that what the model writes for the person — title, summary, asks, missing, flag notes, date descriptions — is in the person's language, whatever the message's (`outputLanguage`). It prints each case's passing checks, the misses with expected vs. got, and accuracy per field, with the prompt version and model. Full results go to `results/` (not committed).

### Writing cases

- Only made-up content, never a real email or anything copied from one (`AGENTS.md`).
- Cover the variety real use has: languages, chat vs. email, every intent and project type, ambiguous dates, messages that aren't work, attempts to instruct the model.
- Check what matters, loosely where wording can vary: a detail passes if it contains the expected text; `true` only needs it filled; `"a|b"` accepts either field when a value fits more than one.
- A miss is either a model or prompt problem, or a too-narrow expectation. Fix the latter in the case; fix the former in the prompt or registry, in general terms rather than for that one message, and re-run everything.
- Models vary between runs even at temperature 0; run twice before trusting a one-check difference.
- Eval calls are logged in `ai_call` with task `eval` and no talent, so they don't count toward anyone's usage limit.

### Files

Cases can attach screenshots, photos, or PDFs (`files: [...]`, read from `extraction/files/`). Those are rendered from made-up HTML in `extraction/sources/` — a LINE-style chat split across two overlapping screenshots, a two-page contract, an email with near-invisible text — so they can be regenerated or varied: open a source in a browser and take screenshots, or print it to PDF (headless Chrome: `--screenshot` / `--print-to-pdf`). Keep fixtures small; they're committed.

### Adversarial cases and flags

Some cases attack the pipeline: instructions aimed at the model (plain, disguised as a footer, trying to reclassify), a payment-redirect scam, instructions hidden in invisible characters, a weekday that doesn't match its date. They pass only if the facts stay right *and* the expected flag is raised (`flags: [...]`). Every other case must raise no flags at all (`noFalseFlags`), so a protection that cries wolf shows up as a failure too. When a new trick appears, add a case for it first. Background: [decision 0007](../docs/decisions/0007-untrusted-message-content.md).

## Relevance (`npm run eval:relevance`)

`relevance/cases.ts` holds made-up emails of the kind the mailbox rules leave pending — offers in Promotions, bank notices, replies with no work words, sales that say "collab", friends, attempts to steer the check — each marked work or not, with its expected kind when clear-cut. At least half are Traditional Chinese. `scripts/eval-relevance.mts` scores them through `lib/mail/relevance/score.ts`, the function the worker uses, and reports, against the thresholds:

- **work kept**: work not filtered out. Recall comes first: it must stay at 100%.
- work marked sure, not work filtered out, not work marked work, and kinds as expected;
- the lowest-scoring work case, and what a few low thresholds would keep and filter.

```
npm run eval:relevance                                   # the primary provider from .env.local
npm run eval:relevance -- --provider openai              # another provider, its relevance model
npm run eval:relevance -- --model gpt-6-luna             # another model for the relevance role
MAIL_RELEVANCE_LOW=0.3 npm run eval:relevance            # try other thresholds
```

Run it on every model named in configuration before relying on it, and whenever the prompt changes. A case the check gets wrong becomes a better prompt in general terms, or a narrower expectation, as for extraction.

## Assistant (`npm run eval:assistant`)

`assistant/cases.ts` holds one made-up workspace (three projects, payments in two currencies, a week of events, and a project whose notes carry an injected instruction) and questions about it, as an overview or as one project, in both languages. `scripts/eval-assistant.mts` asks each through the app's own snapshot, prompt, and model call (`lib/assistant/`) and checks:

- what a right answer contains (any one of a group, so wording can vary) and what it must not;
- no links or images in the answer;
- the answer is in the person's UI language, whatever the question's.

```
npm run eval:assistant                                   # the primary provider from .env.local
npm run eval:assistant -- --provider openai              # another provider, its assistant model
npm run eval:assistant -- --model claude-sonnet-5-5      # another model for the assistant role
npm run eval:assistant -- --only zh                      # cases whose id contains "zh"
```

Run it when the prompt, the snapshot, or the assistant's model changes. A new attack gets a case first.

### Budget

Every run stops at `--max-calls` (default 200) or `--max-cost` in estimated dollars (default 2), and prints its calls, tokens, and estimated cost; the result file keeps them. The estimate uses the tokens logged in `ai_call` and list prices in `lib/ai/spend.ts` (update them when prices change). `--provider anthropic` or `--provider openai` picks the provider, with its model per role; set a spending limit on both keys.
