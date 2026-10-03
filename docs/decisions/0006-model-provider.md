# 0006 — Model calls go through one provider seam; a free local model during development

**Status:** Accepted (2026-10-03)

## Context

Message analysis needs a language model that returns structured data. The architecture names the Claude API for production. During development the priority is getting the intake → analysis → review flow working end to end without paying per call or depending on an API key, and later swapping in a stronger model for real accuracy testing without rewriting the pipeline.

## Decision

- **One seam.** Every model call goes through `lib/ai/model.ts`: `generateObject({ system, prompt, schema })` returns an object that has passed the zod schema, plus a `modelVersion` string. Nothing else talks to a model provider.
- **Configuration picks the model.** `AI_PROVIDER` (`ollama` now; `anthropic` when wired), `AI_MODEL`, and provider settings (`OLLAMA_URL`) come from the environment.
- **Development default: Ollama with Qwen3 8B**, free and open source, run locally. Ollama constrains generation to the JSON schema (`format`), so output is always parseable. Reasoning mode is off (`think: false`): with it on, the model was four times slower and no more accurate on our test offer.
- **Prompts and schemas are provider-neutral** (`lib/ai/prompts.ts`, `lib/ai/analysis.ts`), shared by the app and the evaluation script, so switching models doesn't change what we ask for.
- **Every stored analysis records its `model_version`** (e.g. `ollama:qwen3:8b`), so results from different models can be told apart and compared later.
- **Deterministic clean-up after the model** — invalid dates, times, and zones dropped; currency inferred from how the amount was written; filler like "未提及" emptied — runs whatever the model.

## Alternatives considered

- **Claude from the start.** Best accuracy, but costs per call and needs a key during a stage where the goal is the flow, not extraction quality. It's the next step, behind the same seam.
- **An SDK abstraction (e.g. Vercel AI SDK).** Covers many providers, but adds a dependency and its own conventions for two providers we can wrap in a few dozen lines.
- **OpenAI-compatible endpoints only** (Ollama, LM Studio, vLLM all expose one). Portable, but Ollama's native API controls reasoning mode directly, and Claude would still need its own adapter.
- **Qwen2.5 7B** (also local). Tried on the same offer: it misidentified the counterparty and the reply-by date more often than Qwen3 8B.

## Consequences

- Extraction with an 8B local model is rough: on a sample Chinese gig offer it got the type, fee, summary, and contact details right but guessed a wrong reply-by date. The review screen shows every value as a suggestion, and the reply-by date is confirmed in the form before it becomes a to-do — that rule holds whatever the model.
- A local analysis takes about 30 seconds on an Apple M5 with 16 GB; the inbox shows it as in progress and refreshes on its own.
- Ollama must be running for analysis in development (`ollama serve`, model `qwen3:8b` pulled); otherwise the message shows "couldn't reach Ollama" with a retry.
- Measuring accuracy needs a test set of real offers and a scoring script — planned for the Claude round.
