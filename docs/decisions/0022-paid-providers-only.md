# 0022 — Only the paid providers, in development too

**Status:** Accepted (2026-10-21). Replaces the free development model in [decision 0006](0006-model-provider.md) and the free Gemini tier section of [decision 0015](0015-production-model-providers.md); the seam, roles, backup, logging, and recorded responses stand.

## Context

Decision 0006 used Gemini's free tier and a local Ollama model during development, so the intake flow could be built without paying per call. Decision 0015 kept the free tier for testing until close to launch, behind two flags: `AI_PROVIDER_KEEPS_DATA` marks a provider that may keep what it's sent, and `AI_FREE_TIER_OK` allows mailbox content to reach one. Mailbox content could also run on its own provider in development (`AI_MAILBOX_PROVIDER`, `AI_MAILBOX_MODEL`), usually the local model.

Since the paid adapters arrived, development has run on Anthropic and OpenAI like production. Nothing used the free tier or the local model any more, but they still cost something:

- **The rules for real mail depended on configuration.** Whether a real email could reach a provider that keeps data turned on four variables. One wrong value would send it there.
- **Behavior differed from production.** The local model couldn't read PDFs and read images only with vision; Gemini could refuse to copy published text. Development saw failures production never would, and the reverse.
- **Every new AI feature had to carry the mailbox flag.** The assistant planned next reads data derived from mail, so it would have needed the flag, the guard, and the routing too.

## Decision

- **Model calls go only to Anthropic and OpenAI**, through `lib/ai/model.ts`, in every environment: `AI_PRIMARY` (default `anthropic`) and `AI_BACKUP`, each with its model per role. The Gemini and Ollama adapters are removed.
- **Removed settings:** `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`, `OLLAMA_URL`, `AI_PROVIDER_KEEPS_DATA`, `AI_FREE_TIER_OK`, `AI_MAILBOX_PROVIDER`, `AI_MAILBOX_MODEL`. Mailbox content uses the same providers and models as everything else, and `generateObject` no longer takes a mailbox flag.
- **Removed notices:** the paste and upload dialogs' free-tier notice and the Gmail connect dialog's free-tier line. A permanent line that content is analyzed by AI is still a launch item.
- **Development keys are separate from production's**, with a provider-side spending cap on each (decision 0008).
- **Evals and tests use only made-up content.** Tests run on recorded responses (`AI_REPLAY`); evals run on the paid models with a per-run budget (`--max-calls`, `--max-cost`).
- **Any provider added later must not keep or train on what it's sent**, for development as well as production. Adding one needs its own decision record.

## Alternatives considered

- **Keep both until launch, as decision 0015 planned.** Nothing uses them, and the flags would be one more thing for every new AI feature to get right in the meantime.
- **Keep Ollama for offline work.** Free and private, but no one uses it, its output differs from production's, and it needs its own adapter, capability check, and request queue. Git history has it if it's ever wanted.
- **Keep the free tier for teammates without a paid key.** A shared development key with a spending cap does the same without a second set of rules for real mail.

## Consequences

- Every development run that calls a model costs money. Recorded responses keep tests free; evals print what they spent and stop at their budget.
- Development behaves like production, including how PDFs and images are read.
- `ai_call` rows and stored analyses from before keep `gemini:` and `ollama:` model versions; nothing reads them by provider except cost estimates, which count them as free.
- Relevance thresholds were set on the old models (`lib/mail/relevance/thresholds.ts`); on the paid models (decision 0015, 2026-10-18) every work case was kept and every other filtered at these thresholds, so they stand.
