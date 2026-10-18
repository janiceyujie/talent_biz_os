# 0021: Local metadata sync and conservative relevance foundation

> Historical snapshot: Gmail runtime and migration instructions are superseded by [decision 0023](../decisions/0023-gmail-integration.md).

Date: 2026-10-13. Status: implemented locally, disabled by default. Extends decisions 0013–0016; it does not replace their production ingestion design.

## Scope and boundaries

The first runnable phase reads Gmail metadata through an injected provider, records small per-workspace decisions in PostgreSQL, and checkpoints progress in the existing mailbox queue. It does not fetch message bodies, attachments, or snippets, create projects, change financial records, send email, or invoke a paid model. Nothing is enabled against a real mailbox by this change.

`MAIL_PIPELINE_LOCAL_ENABLED=1` additionally requires `APP_ENV=development`, a loopback PostgreSQL URL, and a non-production process. The checked-in default is `0`. The worker reconciles every 15 minutes only when enabled. Existing OAuth and encrypted token storage remain separate from sync readiness. A successful connection is not evidence of a running or completed sync.

## Existing architecture reused

- `lib/mail/provider.ts` defines the small metadata-only transport contract. Gmail uses fixed official endpoints, bounded responses, timeouts, and redacted errors. Tests inject transport instead of an arbitrary base URL.
- `lib/mail/sync-page.ts` processes one page with at most 500 unique IDs. Initial history is limited by the existing new-only/30-day consent choice. New-only starts at connection creation, not first worker execution.
- A pre-listing profile cursor closes the backfill race. A 404 history cursor recovers from the last successful checkpoint with one day of overlap. Pagination checkpoints, decisions and continuation jobs commit together. A fetch failure never advances the cursor.
- `lib/mail/jobs/sync.ts` runs in the existing worker, decrypts tokens only there, serializes each mailbox through the existing queue, and checks an active owner before reading and again under transaction locks before committing. Revoked/disconnecting or concurrently advanced connections do not receive stale results.
- Migration 0030 is additive: `mail_decision`, `mail_sender_rule`, and `mail_connection.sync_state`. Existing migrations are unchanged. Tables have RLS enabled; server queries scope both workspace and connection. Cross-workspace mutation is not exposed by a client action.
- Decisions contain provider IDs, receipt time, outcome, reason, version, optional score and an optional future `message` reference. They contain no sender, subject, snippet or body. Disconnect cascades these decisions and rules. Sender rules are the intentional exception: exact addresses/domains are stored as the user's preference.
- Files still belong in object storage. Existing `message`/`file`/analysis/review modules are the intended ingestion destination, not a parallel inbox or a new grant-specific finance table.

## Conservative routing

Exact person-defined sender rules override broader domain rules. Block, excluded labels, confirmed work thread, unrelated sent mail, explicit allow/known sender, payment signal, work signal, corroborated bulk promotion, then semantic review run in that order. Promotion category alone never rejects mail. A bulk promotion needs category, unsubscribe and bulk headers with no recognized work/payment signal. Rules are fallible; the future filtered-mail recovery screen remains required before user rollout.

Unknown mail remains `review` with `classifier_not_connected`. Invalid vectors, failed providers, missing classifiers and low scores also remain reviewable. `candidate` and `payment` describe a routing decision, not an imported message or an applied financial transaction. Low similarity never deletes or silently drops an email.

`embeddingClassifier` accepts a provider and a versioned, labeled work/noise index with matching model and dimensions. Input is capped at 512 subject characters; vectors are validated and calls time out. Its cosine-based score is a ranking signal, not a probability. The example 0.8 candidate threshold is not production-calibrated. No real provider, index, model choice or API key was added. `syncMailbox` accepts an optional semantic classifier for controlled integration tests; the default worker passes none.

Existing decisions, especially manual decisions, are preserved across retries. A future classifier-version rollout must explicitly select records for reprocessing; changing a model must not silently reread all historical mail or override personal decisions.

## Still required before a real mailbox pilot

1. Owner-scoped review and filtered-out recovery actions, sender-rule controls, and explicit reprocessing. Current tables support them, but there is no end-user decision browser yet.
2. Bounded body/MIME/attachment retrieval for selected candidates, cleanup of quotes/signatures, payment redaction and expiry, atomic import into existing `message`/`file`, and enqueue existing analysis. No candidate is presently materialized in Intake.
3. A bilingual labeled relevance evaluation, measured false negatives, calibrated routing, provider budget limits and an actual embedding/model adapter. Classification examples may be reviewed fixtures; do not retain real rejected-message embeddings by default.
4. Pub/Sub watch creation/renewal/pull, operational monitoring, retry exhaustion reporting, retention policy and production key management. Polling is only the local foundation; the production gate must not be removed until these are ready.
5. Gmail OAuth verification and any required external security review remain deployment prerequisites from the existing launch checklist.

## Evidence and sources

`lib/mail/pipeline.test.ts` covers conservative rules, sender spoofing, vectors, checkpoint races, retries, metadata-only requests, redacted failures and response bounds. A separate isolated local PostgreSQL check verified tenant-specific rules, deduplication, manual decision preservation, failed cursor retention, revocation and disconnect behavior. No real mail or paid model was used.

Official API references: [metadata retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get), [synchronization and expired history](https://developers.google.com/workspace/gmail/api/guides/sync), [history pagination](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list).

Gmail 403 quota limits remain retryable; insufficient permission is separated from domain policy. See [Google error handling](https://developers.google.com/workspace/gmail/api/guides/handle-errors).
