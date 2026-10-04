# Evals

Checks of AI behavior against cases with known answers. Run one before and after changing a prompt, a field definition, or the model, and compare.

## Extraction (`npm run eval:extraction`)

`extraction/cases.ts` holds made-up messages — every name, address, and number is fictional — each with the facts a correct extraction must contain. `scripts/eval-extraction.mts` runs them through `lib/ai/extract.ts`, the same function the app uses, and scores each expected field.

```
npm run eval:extraction                                  # provider and model from .env.local
npm run eval:extraction -- --model gemini-3.5-flash-lite
npm run eval:extraction -- --provider ollama --model qwen3:8b
npm run eval:extraction -- --only gig                    # cases whose id contains "gig"
npm run eval:extraction -- --locale en                   # the person's language (default zh-TW)
npm run eval:extraction -- --pause 13000                 # slower, for lower per-minute limits (default 4 s)
```

Every case also checks that what the model writes for the person — title, summary, asks, missing, flag notes, date descriptions — is in the person's language, whatever the message's (`outputLanguage`). It prints each case's passing checks, the misses with expected vs. got, and accuracy per field, with the prompt version and model. Full results go to `results/` (not committed).

### Writing cases

- Only made-up content. Development uses a free-tier model provider that may keep what it's sent.
- Cover the variety real use has: languages, chat vs. email, every intent and project type, ambiguous dates, messages that aren't work, attempts to instruct the model.
- Check what matters, loosely where wording can vary: a detail passes if it contains the expected text; `true` only needs it filled; `"a|b"` accepts either field when a value fits more than one.
- A miss is either a model or prompt problem, or a too-narrow expectation. Fix the latter in the case; fix the former in the prompt or registry, in general terms rather than for that one message, and re-run everything.
- Models vary between runs even at temperature 0; run twice before trusting a one-check difference.

### Files

Cases can attach screenshots, photos, or PDFs (`files: [...]`, read from `extraction/files/`). Those are rendered from made-up HTML in `extraction/sources/` — a LINE-style chat split across two overlapping screenshots, a two-page contract, an email with near-invisible text — so they can be regenerated or varied: open a source in a browser and take screenshots, or print it to PDF (headless Chrome: `--screenshot` / `--print-to-pdf`). Keep fixtures small; they're committed.

### Adversarial cases and flags

Some cases attack the pipeline: instructions aimed at the model (plain, disguised as a footer, trying to reclassify), a payment-redirect scam, instructions hidden in invisible characters, a weekday that doesn't match its date. They pass only if the facts stay right *and* the expected flag is raised (`flags: [...]`). Every other case must raise no flags at all (`noFalseFlags`), so a protection that cries wolf shows up as a failure too. When a new trick appears, add a case for it first. Background: [decision 0007](../docs/decisions/0007-untrusted-message-content.md).
