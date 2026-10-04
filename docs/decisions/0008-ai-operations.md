# 0008 — Running the AI features: testing, prompts, paid models, and usage limits

**Status:** Accepted (2026-10-04)

## Context

The AI features work end to end on a free model tier, and that has exposed how they'll have to run for real:

- Tests and evals call the live model on every run, so free-tier quotas (3.5 Flash: 20 requests a day; 3.5 Flash-Lite: 500 a day, about 15 a minute) run out mid-session and tests fail for reasons unrelated to our code.
- Model output varies between runs, even at temperature 0; one run can mislead.
- Production will use a paid model, run work outside the web request, cost money per call, and serve people we don't know — some of whom will try to use the service for free or abuse it.

## Decision

### Testing in three layers

| Layer | Calls a model? | Runs | Checks |
|---|---|---|---|
| **Plain-code tests** | No | Every change | Safety checks, date fixes, clean-up, prompt assembly, and the change rules of the intake flow (docs/design/intake-to-project.md) |
| **End-to-end with recorded responses** | No | Every change | Recorded responses (`AI_REPLAY=only`) return saved model answers keyed by the prompt version and the input; `AI_REPLAY=record` fills them from one live run. End-to-end suites test our flow, not the model. |
| **Live evals** | Yes | When a prompt, field, or model changes | Model quality, against `evals/` |

Live evals:

- **Cache by (prompt version, model, case)**: unchanged cases aren't re-run unless asked (`--fresh`).
- **Smoke set** (about 5 cases) for quick checks; **full set** before accepting a prompt change.
- **Repeat** each case about three times when changing prompts and report pass *rates*.
- **Committed baseline**: a small summary of per-field accuracy per model, so a regression is visible.
- **Respect limits**: one request at a time, pause per the provider's per-minute limit, back off on 429 using the provider's retry hint, stop early when a daily quota is exhausted.
- **A paid development key with a spending cap** once prompts settle: a full run is a few hundred thousand tokens.
- **Real messages later**, anonymized and with consent, kept outside the repository.

### Prompts

- **Prompts are code**, generated from the registries (`lib/ai/prompts.ts`), one canonical prompt per task; provider differences live in the adapters, per-model tweaks only when an eval shows a need.
- **Every call is logged** in an `ai_call` table: task, provider and model, prompt version, input and output tokens, latency, estimated cost, finish reason, failure code, and the person and talent it ran for. It feeds cost tracking, usage limits, and debugging.
- **Significant prompt changes** are recorded with their eval result (commit message or decision record).
- A hosted prompt-management or tracing tool (Langfuse, Braintrust, Promptfoo) only when non-engineers edit prompts or we A/B test.

### Moving to a paid model

- **A Claude adapter** behind `generateObject`, with images and PDFs as content blocks and large files through the provider's file API. Paid Gemini needs only a key and billing tier.
- **A model per task**, set by environment: a small, fast model for extraction (`AI_MODEL_EXTRACT`), a stronger one for reply drafts (`AI_MODEL_DRAFT`).
- **A job queue** (chosen with hosting — Inngest, pg-boss, or QStash; open since M2) for analyses and drafts, with retries, backoff, a dead-letter state, and a per-provider concurrency cap. `after()` in the web request stays for development only.
- **Prompt caching**: the static rules come first and stay identical across calls; today's date and the week's calendar move from the system prompt into the message part, so the rules can be cached by the provider.
- **Keys per environment** with provider-side spending caps; never shared with development.
- **Data**: paid tiers don't train on inputs; the free-tier notice (`AI_PROVIDER_KEEPS_DATA`) is off in production, and a permanent line says content is analyzed by AI. The privacy policy says so too.
- **Evals decide the switch**: the paid model runs the same eval; it ships when it matches or beats the baseline.

### Usage limits

| Control | When |
|---|---|
| Signed in, email verified, before any AI call | Done |
| File types, sizes, counts, signatures; duplicate detection | Done |
| A cap on PDF pages and on the model's output length | Before real users |
| Per-account analyses per day, counted from `ai_call`, shown in the UI | Done |
| A re-analysis cap per message | Done |
| Per-month and short-burst limits | Before real users |
| Rate limits on server actions and the upload and file routes | Before real users |
| A switch to pause AI app-wide (messages wait as "paused" instead of failing) | Before real users |
| Alerts on unusual accounts; a CAPTCHA on sign-up if bots appear | When needed |
| Limits by plan | With billing (Later) |

## Alternatives considered

- **Keep calling the live model in every test.** Simple, but slow, flaky, quota-bound, and it tests the model rather than our code.
- **Mock the model by hand in tests.** Hand-written fake answers drift from what real models return; recorded responses come from a real run and are re-recorded when the prompt changes.
- **Store prompts in the database or a hosted tool now.** Useful for non-engineers and experiments; for one engineer, code review and the version fingerprint are enough.
- **No per-account limits until abuse appears.** The cost of one scripted account is unbounded; limits are cheap to add before launch.

## Consequences

- The replay provider and `ai_call` log come before the intake-flow work, so its tests don't spend quota.
- Recorded responses must be re-recorded when the prompt version changes; replay fails loudly when a recording is missing rather than calling a live model.
- Costs become measurable per task, per person, and per prompt version.
- The job queue ties to the hosting decision; until it's made, development keeps `after()`.

## Implementation notes (2026-10-03)

- `ai_call` logs task, provider, model, prompt version, tokens, latency, status, and failure code. Estimated cost and finish reason are not stored yet; cost comes with the paid-model price table.
- Recording keys leave out the system prompt, which carries today's date and calendar, so a recording stays valid across days; the prompt version still changes it whenever the rules change.
