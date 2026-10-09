# Luna assistant: local experiment

## Scope and provenance

This branch adapts the prototype's Responses API assistant into the existing product. The prototype remains unchanged. New developer prose, identifiers and comments are English; localized interface strings and multilingual test inputs are intentional exceptions.

The assistant supports editable text, keyboard submission with IME protection, project selection, synthetic sample mode, recent conversation context, error recovery and per-response token/cost display. It provides answers and drafts only. The separate draft-workbench screen is not converted in this experiment. Chat saves each successful exchange in account- and workspace-scoped local files under `.ai-local/conversations/`. Reload restores the latest saved conversation; starting a new conversation or changing scope preserves older conversations in the archive. Only eight recent messages are sent to the model. The history endpoint displays the latest 500 exchanges and explicitly flags truncation; older files remain on disk. Sessions from before persistence was added cannot be recovered.

The server authorizes the current person and talent, verifies email, selects context on the server, and validates request size. A project selection cannot fetch another talent's project. The overview sends aggregates only; a selected project sends its own bounded records. Neither mode sends credentials, Google tokens, another account's data or real Gmail messages. OpenAI receives questions and selected context with `store: false`; this is not a claim of zero provider retention.

## Data safety

Supabase hosts PostgreSQL and file storage; a Git branch does not isolate either service. The OpenAI adapter rejects production mode, a missing explicit opt-in, or a non-loopback database URL. No schema or migration changes are needed. Existing `ai_call` rows record account-scoped assistant activity. Model answers never mutate business records or call tools.

`assistantSamples()` adapts `sampleWorkspace(true)` from the prototype: five projects, eight payments and two tasks. Base amounts and stages are preserved. Relative dates are fixed to October 7, 2026 for reproducibility. The synthetic multi-talent portfolio is not inserted into the single-talent database. Project terms are copied only where they were explicitly meaningful; inherited prototype placeholder terms are not treated as real contract evidence. Original TWD base payment values are converted to actual tax-inclusive cash for `settledAmount`, matching the product's `paymentCash` semantics. Sample amounts are not revenue forecasts.

## Local configuration

Use the ignored `.env.local`:

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-6-luna
AI_LOCAL_EXPERIMENT=1
AI_LOCAL_BUDGET_USD=5
AI_PROVIDER_KEEPS_DATA=0
OPENAI_API_KEY=<set privately>
```

The existing default daily account limit is 50 AI calls (shared with extraction). Proposed subscription quotas in the evaluation report are planning options, not implemented billing plans.

The same OpenAI adapter powers text extraction behind `generateObject`. PDF and image extraction with OpenAI is intentionally rejected with `unsupported_file`; Gemini/Ollama paths remain available. No silent attachment dropping and no model substitution. Replays are keyed by provider and model as well as prompt version/input.

## Cost controls

All local OpenAI calls share `.ai-local/budget.json`, including UI, extraction and evaluation scripts. The budget ledger stores usage metadata, not prompts or credentials. The separate conversation files contain questions and answers; the interface discloses this local storage. The ledger and the two credential files are ignored by Git. A filesystem lock serializes calls across processes. UTF-8 request bytes plus 4,096 framing tokens are conservatively reserved at the cache-write rate before sending; output is reserved at the configured cap. On completed responses, actual API-reported usage replaces the reservation. Failed requests with unknown billing outcomes retain the reservation. No automatic retries or automatic budget reset. A stale lock after a hard crash requires deliberate inspection before removal.

The ceiling is clamped to USD 5 even if an environment value is higher. It governs calls through this checkout, not unrelated API activity elsewhere on the same OpenAI account. Standard global rates only; the adapter selects the default service tier. Output includes reasoning tokens, so reasoning is reported separately but never billed twice.

## Reproduce

```bash
npm test
npm run i18n:check
npm run lint
npx tsc --noEmit
npm run build
npm run eval:assistant
```

`eval:assistant` runs 100 unique synthetic scenarios sequentially, pauses between calls, resumes completed cases and checkpoints to ignored `evals/results/assistant/`. It fingerprints the prompt, cases and supplied contexts. Three consecutive failures stop a run. The shared cost guard applies before every live call.

The second evaluation run includes payment due dates omitted from the first. A targeted check should follow any future prompt/context change. The cost report uses the final run's usage; total experiment spend also includes the first run and smoke tests. The 100-case suite is one sample per scenario, not a statistical quality guarantee or a production load test.

## Before shared deployment

This is a local development branch, not a production rollout. Janice should review AI boundary changes and the new shared instructions. A hosted implementation needs durable account-scoped monthly budgets, atomic reservations, a queue, retention decisions for chat history, and plan enforcement. The authenticated local history endpoint exposes only the current person/workspace records and two fixed synthetic evaluation files; viewing results does not call OpenAI. The filesystem budget and process-local burst limiter are not a distributed billing system. Review existing build-tracing warnings before any deployment, and use separate credentials and databases for staging and production.
