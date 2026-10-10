# 0006 — Model calls go through one provider seam; a free model during development

**Status:** Accepted (2026-10-03). The production choice (Claude) is replaced by [decision 0015](0015-production-model-providers.md); the seam stands.

## Context

Message analysis needs a language model that returns structured data. The architecture names the Claude API for production. During development the priority is getting the intake → analysis → review flow working without paying per call, and swapping in another model later without rewriting the pipeline.

## Decision

- **One seam.** Every model call goes through `lib/ai/model.ts`: `generateObject({ system, prompt, schema })` returns an object that has passed the zod schema, plus a `modelVersion` string. Nothing else talks to a model provider.
- **Configuration picks the model.** `AI_PROVIDER` (`gemini`, `ollama`; `anthropic` when wired), `AI_MODEL` (one model, or a fallback list tried in order when one is busy), and provider settings (`GEMINI_API_KEY`, `OLLAMA_URL`) come from the environment.
- **Development default: Gemini 3.5 Flash-Lite on the free tier**, falling back to 3.1 Flash-Lite. Both constrain output to the JSON schema. On the extraction eval it scored 117–118 of 118 checks at about 2 seconds a message. Gemini 3.5 Flash scored as well on the cases it ran, but its free tier allows only 20 requests a day — too few to run the eval.
- **Say what the free tier does; let people decide.** Google may keep free-tier inputs, use them to improve its products, and have people review them. With `AI_PROVIDER_KEEPS_DATA=1` the paste and upload dialogs state this and name the service, and caution only against passwords, verification codes, ID numbers, and bank account numbers — many people are fine sharing contract details with an AI. Production uses a paid provider, which doesn't train on what it's sent. The committed eval cases stay made-up, since they're sent on every run.
- **Ollama with Qwen3 8B stays available offline** (`AI_PROVIDER=ollama`). It constrains generation to the schema (`format`); reasoning mode is off (`think: false`) — with it on, the model was four times slower and no more accurate.
- **Prompts and schemas are provider-neutral** (`lib/ai/prompts.ts`, `lib/ai/analysis.ts`), shared by the app and the evaluation script, so switching models doesn't change what we ask for.
- **Every stored analysis records its `model_version`** (e.g. `ollama:qwen3:8b`), so results from different models can be told apart and compared later.
- **Deterministic clean-up after the model** — invalid dates, times, and zones dropped; currency inferred from how the amount was written; filler like "未提及" emptied — runs whatever the model.

## Alternatives considered

- **Claude from the start.** Costs per call during a stage where the goal is the flow. It's the production choice and goes behind the same seam, compared on the same eval.
- **An SDK abstraction (e.g. Vercel AI SDK).** Covers many providers, but adds a dependency and its own conventions for two providers we can wrap in a few dozen lines.
- **OpenAI-compatible endpoints only** (Ollama, LM Studio, vLLM all expose one). Portable, but Ollama's native API controls reasoning mode directly, and Claude would still need its own adapter.
- **Qwen2.5 7B** (also local). Tried on the same offer: it misidentified the counterparty and the reply-by date more often than Qwen3 8B.

## Consequences

- Accuracy is measured, not guessed: `npm run eval:extraction` (see `evals/README.md`). Relative weekdays were the weakest point until the prompt began listing this week's and next week's dates.
- Extraction with the 8B local model is rough (it got a sample offer's reply-by date wrong) and slow (about 30 seconds). The review screen shows every value as a suggestion, and the reply-by date is confirmed in the form before it becomes a to-do — that rule holds whatever the model.
- Free-tier limits can return "busy" or "rate limit reached"; the message shows the reason with a retry.
