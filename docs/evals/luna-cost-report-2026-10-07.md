# Taloox Luna local evaluation — October 7, 2026

## Decision

Use `gpt-6-luna` with low reasoning for this local assistant experiment. The final 100-scenario run completed 100/100 API responses for **USD 0.011476**. This supports a low text-assistant inference cost under the tested context sizes, not a promise about future usage, complete accuracy, or profitability.

Keep the approved shared experiment ceiling at **USD 5**. No deployment or GitHub push was performed. Branch: `user/Timothy0324/luna-assistant-eval`.

## Measurement and pricing

The Responses API returned **62,220 input tokens** and **10,349 output tokens**, including **345 reasoning tokens** within output. Input included 0 cached-read tokens and 3,182 cache-write tokens. Average per request: 622.20 input and 103.49 output tokens; estimated cost $0.00011476.

Standard USD rates per million tokens, verified October 7, 2026: input $0.10; cached input $0.01; cache write $0.125; output $0.50. See [official Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) and [OpenAI API pricing](https://developers.openai.com/api/docs/pricing). The adapter selects the default service tier. No regional processing or fast-tier multiplier is included. These requests are below the 272,000-input-token long-context threshold.

Cost formula: `((input - cachedRead - cacheWrite) * 0.10 + cachedRead * 0.01 + cacheWrite * 0.125 + output * 0.50) / 1,000,000`. Reasoning is already included in output and is not added again. These are API-usage-based estimates, not a downloaded billing invoice; taxes and unrelated account activity are excluded.

API latency: median **1.612s**, p95 **3.763s**, maximum **6.347s**. These exclude browser rendering and database time. Per-request cost p95 **$0.0002309**, maximum **$0.0003859**. Percentiles use nearest rank on 100 observations.

## Test design

100 distinct scenarios, 10 in each category. The same instructions, context builder and OpenAI adapter used by the app power the evaluator. Fixture date is October 7, 2026, Asia/Taipei. Requests use standard service tier, low reasoning and a 1,500-token output ceiling. Ten follow-up cases include two synthetic prior turns. Longer cases include repeated user text. This does not simulate 100 consecutive turns in one conversation or a complete month of usage.

Five synthetic projects, eight payments and two tasks were adapted from the prototype. Sample mode uses memory fixtures; it does not insert mock business rows into PostgreSQL. The first run exposed missing payment due dates in model context; these were added before the final run. Actual settled cash follows the existing product's tax-inclusive semantics.

| Category | Requests | Input tokens | Output tokens | Estimated USD |
|---|---:|---:|---:|---:|
| payments | 10 | 4,663 | 743 | $0.000838 |
| brand | 10 | 6,780 | 1,313 | $0.001334 |
| schedule | 10 | 7,470 | 685 | $0.001089 |
| negotiation | 10 | 5,264 | 922 | $0.000987 |
| contracts | 10 | 6,810 | 1,855 | $0.001609 |
| adversarial | 10 | 4,698 | 663 | $0.000801 |
| rude_ambiguous | 10 | 4,706 | 672 | $0.000807 |
| long_context | 10 | 8,704 | 1,828 | $0.001864 |
| followups | 10 | 7,385 | 918 | $0.001197 |
| edge_cases | 10 | 5,740 | 750 | $0.000949 |

The first 100-scenario run cost $0.010441; the final run cost $0.011476. Including initial model smoke, one browser assistant request and one extraction smoke, the local ledger contains **203 requests** and **$0.022673** at report generation. Reserved/unknown-outcome entries: 0. Subsequent user tests will increase this ledger.

## Quality findings and limits

- **100/100 completed** means transport/model completion, not 100% correct answers.
- Nine targeted money/date string checks passed **9/9**: received, receivable, paid, payable, tax calculation, remaining balances and three days overdue. These are narrow regression checks, not an independent quality judge.
- Manually reviewed all ten adversarial cases: no exposed keys, fabricated successful send, automatic payment or database operation. The model has no tools and never receives credentials. Prompt refusal alone is not the security boundary.
- Reviewed rude/ambiguous requests and selected schedule, contract and follow-up outputs. The assistant generally asks for missing project context and distinguishes drafts from actions.
- **Known style failure:** `rude_ambiguous-08` asks for at most ten Chinese characters; the reply exceeds that. Strict length compliance is not reliable.
- **Known clarity weakness:** overview replies sometimes emphasize omitted payment rows even when aggregate totals answer the question. Some replies repeat more context than needed.
- **Extraction smoke:** `gig-wedding-en` completed and passed **10/11** existing field checks, but fabricated a weekday inconsistency: October 24, 2026 is a Saturday. Amount, currency, tax, date, venue and counterparty checks passed. Treat extracted records as review-required; the full extraction suite was not evaluated for Luna.
- One model/sample per scenario, no independent blinded reviewer, no production traffic, no Gmail retrieval, no image/PDF costs, no multilingual coverage guarantee, no long-running concurrency/load test. The UI's eight-turn history limit can cost more than this suite's short histories.

## Subscription planning: USD 20 Basic and USD 40 Pro

Recommended beta starting limits: **Basic 100 assistant replies/day, 3,000/month; Pro 300/day, 9,000/month**, with separate token pools and a monthly AI cost ceiling. One unit means one submitted question and one generated answer; follow-ups each count separately. Long inputs and extraction must consume token/cost pools as well. Limits must be enforced together; whichever is reached first applies. These are proposed limits, **not implemented subscriptions**.

The following assumes a 30-day month and every allowed assistant reply is used. Observed-average input/output totals scale the final 100 cases; p95/max columns repeat that observed per-request cost for every reply. They are scenarios, not confidence bounds or theoretical worst cases.

| Plan | Monthly price | Replies/day / month | Monthly input at test average | Monthly output at test average | Cost at test average | Every call at observed p95 cost | Every call at observed maximum cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Basic | $20 | 100 / 3,000 | 1,866,600 | 310,470 | $0.344 | $0.693 | $1.158 |
| Pro | $40 | 300 / 9,000 | 5,599,800 | 931,410 | $1.033 | $2.078 | $3.473 |

Suggested additional per-account monthly safeguards:

| Safeguard | Basic | Pro |
|---|---:|---:|
| Input token pool, including repeated context | 6,000,000 | 20,000,000 |
| Output token pool, including reasoning | 1,000,000 | 3,000,000 |
| Text inference cost if both pools fill, all input charged at $0.125/M | $1.25 | $4.00 |
| Total AI cost ceiling, including extraction/retries/other models | $3.00 | $8.00 |
| Revenue remaining after that AI ceiling only | $17.00 (85%) | $32.00 (80%) |

These percentages are **not gross margins**: hosting, database/storage, email, payment fees, taxes, support, refunds and customer acquisition are not measured. USD 40 is a reasonable beta price to test for Pro's workflow value and larger allowance; token cost alone cannot establish willingness to pay. USD 20/40 are hypotheses, not validated market prices.

At launch, use a tokenizer-aware per-request input limit (for example 6,000 tokens) and an output ceiling (1,500 here), with atomic account/month reservations before sending. Reject, trim with disclosure, or ask to split oversized requests. Reserve worst-case output, reconcile actual billed usage, account for failed/unknown calls and caching, and never let retries bypass limits. Separate attachment/extraction costs from a simple chat-message count.

The current local adapter's broad safety bound of 200,000 UTF-8 bytes plus framing and 1,500 output tokens reserves up to $0.026262 per assistant call. Repeating that bound 3,000 times is $78.786, so **a message count alone cannot guarantee sustainable cost**. Current local app behavior remains the existing 50 AI calls/day account limit plus the shared USD 5 experiment ledger, not the proposed Basic/Pro limits.

## Verification and artifacts

- 88 unit tests passed; TypeScript and Next production build passed.
- English and Traditional Chinese catalogs match (1,254 keys); registry labels pass.
- Lint: no errors, three existing warnings. Build retains the existing recordings-directory tracing warning. No migration/schema changes.
- Browser sample-mode smoke returned NT$186,900 receivable and displayed real API token usage/cost. Business data was not modified.
- Cases: `evals/assistant/cases.json`.
- Final raw synthetic results: `evals/results/assistant/luna-100-v2.json` (ignored by Git).
- Shared cumulative ledger: `.ai-local/budget.json` (ignored by Git; do not reset to bypass the cap).
- Setup and remaining deployment work: `docs/evals/luna-local-setup.md`.
