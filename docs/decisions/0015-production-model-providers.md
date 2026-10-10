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
