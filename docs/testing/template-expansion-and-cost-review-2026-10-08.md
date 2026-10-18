# Template expansion and assistant cost review

Date: 2026-10-08. Local branch: `user/Timothy0324/luna-assistant-eval`.
No commit, push, deployment, migration, or business-record changes were made.

## Document library

Expanded the library from eight to eighteen scenarios. Each scenario has English and Traditional Chinese contract and quote versions: 72 editable DOCX files total.

- Musician: live performance, music license, recording session.
- Manager: artist management, booking representation, campaign coordination.
- Model: modeling shoot, runway appearance, brand ambassador.
- Influencer: sponsored content, UGC production, affiliate promotion.
- Video: production, editing, event coverage.
- Other: podcast sponsorship, general services, podcast guest appearance. Podcaster remains a document scenario, not a new persisted account role.

Each agreement has a scenario-specific title and scope, term, acceptance, payment, rights, cancellation, legal and execution sections. The nine-article reference layout is retained. New clauses address usage licenses, paid advertising and account permissions, disclosure, commissions, approvals, supplied materials, releases and permissions as appropriate. Commercial values remain editable placeholders. These are general templates, not jurisdiction-specific lawyer-approved documents.

Chinese runs and styles explicitly use KaiTi, which is installed with Word on this Mac; Latin runs use Times New Roman. KaiTi is not the Windows DFKai-SB font. The unavailable DFKai-SB name initially caused fallback, so it was replaced with the installed family and checked in the resulting PDFs. Font binaries are not redistributed. Other computers may substitute fonts if the named fonts are missing.

All 72 final files were rendered: 36 three-page contracts and 36 one-page quotes, 144 pages total. All pages were visually reviewed, including the one duplicate page. No clipped text, unexpected blank pages or overflow were observed. Package checks confirm KaiTi/Times New Roman assignments and no Gothic assignments in document/style font properties. Downloads use the same locale content as the application preview.

Research references reviewed for practical scenario coverage, without copying full agreements:

- https://commonpaper.com/standards/professional-services-agreement/
- https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
- https://www.sagaftra.org/contracts-industry-resources/influencer-resources/influencer-agreement-101
- https://musiciansunion.org.uk/working-performing/recording-and-broadcasting/working-as-a-recording-session-musician
- https://learn.microsoft.com/en-us/typography/font-list/dfkai-sb

## Interface

Attached the Finance toolbar to its existing alignment rules. Aligned document filters and action controls, standardized shared toolbar control heights, added narrow-screen wrapping, and reserved title height to align document-card actions. The library and secondary details retain their collapsed defaults. Manager filtering now shows manager scenarios rather than every role.

Desktop Finance and Drafts/document-library layouts were inspected during this change. The final card-height adjustment, new authenticated analysis page, and every other tab were not exhaustively rechecked in the browser: the active Chrome window repeatedly changed during final verification. Do not interpret the earlier cross-page smoke review in `contract-and-interface-review.md` as a new full regression pass. A separate bilingual static evaluation report was opened and visually checked in the in-app browser, with its figures verified against the result files.

## Live evaluation

Both new runs completed with no incomplete rows. There were 160 paid calls and 40 deterministic local replies.

| Run | Exchanges | AI / local | Input tokens | Output tokens | Total tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Daily independent questions | 100 | 60 / 40 | 39,385 | 7,117 | 46,502 | 0.007497 |
| Twenty conversations, five exchanges each | 100 | 100 / 0 | 153,659 | 28,755 | 182,414 | 0.033102775 |
| Total | 200 | 160 / 40 | 193,044 | 35,872 | 228,916 | 0.040599775 |

The shared ledger grew from 211 to 371 settled entries, from USD 0.0234246 to USD 0.064024375. No ledger reset or cap increase occurred. Local database host and local-experiment opt-in were verified before execution. The shared cap remains USD 5.

The evaluator uses the application router, context assembly, instructions and OpenAI adapter with synthetic fixtures, but bypasses authenticated UI plumbing and daily rate limiting. Follow-ups include actual prior responses with an eight-message history window. Mixed question/UI-language cases are intentional test coverage; one sampled response used Simplified Chinese despite a Traditional Chinese interface setting. This is a usage evaluation, not a quality certification. Representative adversarial responses did not claim to send, sign, pay, delete or expose credentials. No external messages were sent.

Model: gpt-6-luna, low reasoning, standard tier, 1,500 output-token cap. Usage includes reasoning in output and cached reads/writes within input. USD values are calculated estimates rather than invoice reconciliation. Official pricing verified on the review date: https://developers.openai.com/api/docs/models/gpt-6-luna

## Plan hypotheses

Basic USD 20/month with 30 AI replies/day; Pro USD 40/month with 100/day. Count each follow-up as another reply; exclude deterministic local lookups. These are recommendations, not implemented plan enforcement.

At full use for 30 days, using AI-only means across the two runs:

| Plan | Monthly replies | Mean-token range | Mean-cost range USD | Observed scenario min-max USD |
| --- | ---: | ---: | ---: | ---: |
| Basic | 900 | 697,530-1,641,726 | 0.112455-0.297924975 | 0.06444-0.513045 |
| Pro | 3,000 | 2,325,100-5,472,420 | 0.37485-0.99308325 | 0.2148-1.71015 |

The observed min-max repeats the cheapest or most expensive observed AI reply all month; it is not a guaranteed bound. The runs are not pooled with two older 100-case runs, because routing, prompts and case mixes differ. Small synthetic samples cannot establish customer percentiles.

To enforce a future maximum, propose 6,000 input tokens including all instructions/history/context plus 1,500 output tokens, using the higher cache-write price for all input: USD 0.0015/reply, or USD 1.35/4.50 for Basic/Pro per 30 days. Add monthly inference budgets of USD 1.50/5 with pre-call reservation and accounting for retries and incomplete responses. These controls are not implemented. The existing local byte-based guard reserves up to USD 0.026262/request and the shared USD 5 cap is not a customer plan budget.

Excludes Gmail, embeddings, attachments, database/hosting, payment fees, support, tax and acquisition. These are not total operating costs or margin estimates. Prices need customer validation.

## Deliverables and verification

- Authenticated local analysis page: `/assistant/costs`, linked from Assistant. Run selection, AI-only projections, daily-use calculator, category costs, expandable per-exchange records and CSV export; both locales.
- Ignored raw results: `evals/results/assistant/luna-daily-100-v3.json` and `luna-followup-100-v3.json`.
- Standalone bilingual HTML, combined 200-row CSV and 72-document ZIP in the task's `taloox-review-v4` artifact directory.
- Passed: 101 tests, production build including TypeScript, targeted ESLint, i18n parity with 1,633 keys and 74 registry labels.
- Existing build warning remains at `lib/ai/model.ts:132`: dynamic recording-directory tracing can enlarge deployment output. No deployment was attempted.
