# 0024 — Prepare invoices in Gmail drafts; owners send in Gmail

## Status

Accepted for the local implementation; real-account pilot pending. Extends decision 0013's default read-only connection with optional invoice-draft consent. Preserves decision 0016's worker-only token decryption.

## Context

Freelancers want billing details, email and PDF prepared automatically but want their own Gmail identity and the final review/send action. A separate Taloox SMTP sender does not meet that workflow.

## Decision

Keep ordinary Gmail ingestion read-only. Request `gmail.compose` only through explicit invoice-draft consent. Disclose that Google bundles send permission with this scope, although our invoice API has no send/update/delete operation. The web queues an approved invoice revision; the worker creates its MIME draft with PDF. Optional date-based automation requires per-invoice opt-in and pins the approved account subject.

Keep billing snapshots, revision, approval, draft/message IDs and status in PostgreSQL, PDF bytes in private object storage, and the actual editable draft in Gmail. Only owners act; managers do not inherit mailbox write authority. Use the existing encryption/worker boundary, never a browser token or a second mailbox credential store.

Reserve creation transactionally, POST once, and reconcile ambiguous results instead of retrying. Do not overwrite user edits or equate a missing draft with sent. Require a unique matching SENT message before recording sent. Unresolved identity stays unresolved without automatic recreation. Live writes are disabled by default; local QA uses a fake server.

## Alternatives considered

- Taloox SMTP send: changes the user's expected sender and keeps a send action in the app.
- Automatic Gmail send: removes the user's final review.
- Download-only email files: avoids consent but retains manual attachment/import work.
- Retrying failed create calls: can create duplicate drafts after an ambiguous response.

## Consequences

Additional OAuth consent and eventual Google verification are required. Draft creation is not sending, and sending is not proof of delivery or payment. The app's original email/PDF snapshot can differ from subsequent Gmail edits. Missing or ambiguous drafts need review; bounded reconciliation is conservative. No new dependency is required for this change.
