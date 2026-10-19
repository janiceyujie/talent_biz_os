# 0015 — OpenAI and Anthropic in production, one primary and one backup

**Status:** Accepted (2026-10-10). Replaces the production choice in [decision 0006](0006-model-provider.md) (Claude only) and the paid-model bullets of [decision 0008](0008-ai-operations.md); the seam, evals, and logging from both stand.

## Context

Decision 0006 put every model call behind one seam (`lib/ai/model.ts`) and used Gemini's free tier in development, with Claude named for production. Reading the connected mailbox (decision 0013) changes the stakes:

- **The free tier can't see anyone else's Gmail.** Google may keep and use free-tier inputs, and Google's Limited Use policy for restricted Gmail data forbids that use. Unlike paste and upload, the person no longer decides message by message what is sent.
- **Two tasks with different needs**: a relevance check on every email the rules don't settle (short input, high volume), and analysis of the emails brought in (longer input, structured extraction, sometimes contracts and PDFs).
- **A provider outage should delay mail, not stop it.**

## Decision

### Providers

- **Production uses OpenAI and Anthropic.** One is the **primary** for every task; the other is the **backup**. Both are set in configuration, not code (e.g. `AI_PRIMARY=anthropic`, `AI_BACKUP=openai`), with each provider's model names per role.
- **The backup is used only when the primary is unavailable**: connection errors, timeouts, 5xx responses, and rate limits still failing after the usual retries. A bad answer (output failing the schema) is a quality problem: it escalates to the larger model or fails visibly; it doesn't switch providers.
- Each provider gets its own adapter behind `lib/ai/model.ts`, using its official SDK (`@anthropic-ai/sdk`, `openai`). Nothing else imports them.
- Which provider is primary is decided by the evals: the extraction eval and the relevance eval run on both, and on every model named in configuration.

### Models by role

| Role | Used for | Model |
|---|---|---|
| `relevance` | Sender, subject, and snippet → a score | The primary's small model |
| `analysis` | A message brought in, the default | The primary's mid-size model at low effort |
| `analysis_complex` | Contracts, PDF attachments, long or multi-party threads, low confidence, a schema failure on `analysis` | The primary's large model |

The router that picks the role is plain code (task, intent, attachments, thread length, body size, confidence), never a model. Every call is already logged in `ai_call` with provider and model, so cost per role and how often the backup or escalation runs are measurable.

### The free Gemini tier, for testing only

- It stays available (`AI_PROVIDER_KEEPS_DATA=1`) until close to launch, then the Gemini adapter and both flags are removed (launch checklist).
- **A message from Gmail is never sent to a provider marked `AI_PROVIDER_KEEPS_DATA`** unless `AI_FREE_TIER_OK=1`. That flag means "this deployment is for testing, and everyone whose mail it reads has accepted the free tier's terms": the builder and team members who know them, never external test users.
- **`APP_ENV`** (`development`, `testing`, `production`) names the deployment explicitly, since a test deployment on Render also runs with `NODE_ENV=production`. The app refuses to start with `AI_FREE_TIER_OK=1` when `APP_ENV=production`.
- With the flag on, the Gmail connect screen says the email will be analyzed by Google's free tier, which may keep and use it, as the paste and upload dialogs do now.

## Alternatives considered

- **Claude only** (decision 0006). One adapter and one eval, but an Anthropic outage stops analysis.
- **Per-task primaries** (relevance on one provider, analysis on the other) or a route table per task. More flexible, more to keep evaluated; one primary and one backup is enough until evals show a reason.
- **Calling both providers on every email and comparing.** Doubles cost; a small comparison sample can be added later if the backup's quality needs watching.
- **The Vercel AI SDK.** Decision 0006 already turned down an abstraction SDK for a few dozen lines per provider.
- **Paid Gemini.** Already wired and cheap; not one of the production providers.

## Consequences

- New dependencies: `@anthropic-ai/sdk` and `openai`.
- Two sets of keys with provider-side spending caps, per environment.
- Prompts and schemas stay provider-neutral (`lib/ai/prompts.ts`, `lib/ai/analysis.ts`); each provider's structured-output mode is handled inside its adapter.
- The privacy policy names both providers as processors, and their no-training and retention terms are checked before launch.
- Paste and upload use the same roles and router, so the free-tier rule for them stays as decision 0006 describes until launch.

## Implementation notes (2026-10-13)

- Calls name a role (`analysis`, `relevance`; `lib/ai/model.ts`). Until the paid adapters arrive (ai-providers), relevance can run on its own provider and model in development, `AI_MAILBOX_PROVIDER` and `AI_MAILBOX_MODEL`.
- The free-tier rule is enforced in `generateObject`: a request marked as mailbox content goes to a provider marked `AI_PROVIDER_KEEPS_DATA` only with `AI_FREE_TIER_OK=1`, which throws with `APP_ENV=production` (the worker checks it at start). With the flag on, the Gmail connect dialog says so.
- Relevance calls are logged in `ai_call` (task `relevance`) and don't count toward the daily analysis limit.
- Recorded answers (`AI_REPLAY`) are keyed by provider and model too, so an eval on one model never replays another's.

## Implementation notes (2026-10-18, ai-providers)

- **Configuration** (`lib/ai/model.ts`): `AI_PRIMARY` and `AI_BACKUP` name the providers (`anthropic` and `openai`; `gemini` and `ollama` stay for development, with `AI_PROVIDER` read when `AI_PRIMARY` isn't set). Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Each paid provider has a model per role, overridable with `AI_MODEL_<PROVIDER>_<ROLE>`: relevance on `claude-haiku-5-5` / `gpt-6-luna`, analysis on `claude-sonnet-5-5` / `gpt-6.1-sol`, analysis_complex on `claude-opus-5-5` / `gpt-6-astra`. Anthropic is the primary until the evals say otherwise.
- **Adapters**: the official SDKs, imported only in `lib/ai/model.ts`. Both use their structured-output mode with the same JSON Schema, cleaned of what they don't accept (numeric bounds) and with closed objects (`providerSchema`); the answer is still checked against the zod schema. PDFs go to Anthropic as a document block and to OpenAI as an input file; images as images. Effort is low for relevance and analysis, medium for analysis_complex.
- **The backup** is called only when the primary is unreachable, overloaded (5xx, Anthropic's 529), or rate-limited after the SDK's own two retries; a bad answer (`invalid_output`) never switches provider. Each attempt is its own `ai_call` row.
- **Routing** (`lib/ai/extract.ts`): a PDF or a message over 8,000 characters goes to analysis_complex; otherwise analysis, then analysis_complex again when its answer has confidence below 0.5, is a contract, or doesn't fit the schema. With a provider that has one model for every role (Gemini, Ollama), nothing is asked twice.
- **Mailbox content** in development still follows `AI_MAILBOX_PROVIDER` and `AI_MAILBOX_MODEL`, with no backup; unset, it goes to the primary, which is what production does.
- **Budgets.** Each eval run stops at `--max-calls` (default 200) or an estimated `--max-cost` (default $2), estimated from the tokens in `ai_call` and list prices (`lib/ai/spend.ts`), and prints what it spent. A mailbox's own calls, scoring and payment notices, are capped at `AI_DAILY_RELEVANCE` a day (default 500; `canScore` in `lib/ai/usage.ts`); past it, emails wait for a later check. The providers' spending limits remain the hard cap.
- **First evals on both** (2026-10-18; relevance prompt b256ba0fb1f6, analysis prompt 21aa2ae97396, made-up cases only; about $1.22 in all). Relevance, 38 emails: both perfect (20/20 work kept, 18/18 not work filtered, 32/32 kinds), each under a cent. Extraction, 27 messages: Anthropic 26/27 cases and 239/240 checks, about $0.64 and 5 seconds a message (one intent labelled negotiation for an inquiry); OpenAI 26/27 and 238/240, about $0.57 and 11 seconds (it missed the amount in the payment-redirect scam, still flagged). Contracts went to the large model on both. Anthropic stays the primary: as accurate, twice as fast, and its miss was a label rather than a fact.
