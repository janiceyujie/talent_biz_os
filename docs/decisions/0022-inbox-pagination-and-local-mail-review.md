# 0022: Paginated intake and explicit local Gmail review

> Historical snapshot: Gmail runtime and migration instructions are superseded by [decision 0023](../decisions/0023-gmail-integration.md).

Date: 2026-10-13. Status: implemented locally; Gmail pipeline remains disabled by default.

## Inbox loading

The shared layout no longer sends the latest 200 complete messages and their analysis history to every page. It sends status counts, up to eight review summaries, a revision marker, and per-project latest-message timestamps. Preview mode continues to use its existing in-memory fixtures and explicitly clears live inbox statistics.

`GET /api/inbox` queries PostgreSQL for 20 summaries plus a continuation marker. Ordering uses receipt time and UUID, preserving PostgreSQL timestamp precision in the cursor. Cursors are bound to the owner workspace and dismissed filter. Counts cover the full matching collection. The database now indexes workspace, receipt time and ID.

`GET /api/inbox/[id]` reads one complete message, its latest analysis and its files. It works for links to messages older than the first 200, including dismissed messages. Earlier confirmed sender/date facts are loaded only for an analyzed message's project-matching step; no earlier bodies or redundant analysis versions are returned. This context remains proportional to confirmed messages and is a separate future optimization if large-workspace measurements warrant it.

All endpoints resolve the current owner through the existing auth layer, scope queries to that workspace and return private/no-store responses. The UI aborts stale requests, clears details on workspace/preview changes, provides retry controls, and moves mobile focus after the selected detail arrives.

## Gmail pilot extension

This extends decision 0021 using the existing connection, decision, message, analysis, and queue modules. It does not create a second business inbox. `MAIL_PIPELINE_LOCAL_ENABLED` still requires an explicitly enabled development process and a loopback database. Neither the real local worker nor the local web environment was enabled by this change.

- Non-skipped decisions may retain a bounded subject (512 characters) and sender (320 characters) for explicit review. Skipped mail still retains only IDs, receipt time and decision fields; the database enforces a null preview for skipped mail.
- The collapsed Gmail review area, visible only when the local pipeline is enabled and Gmail is connected, offers Needs review, Filtered out and Imported views. Each view is paginated by 20.
- The owner can mark a candidate Not work, restore a filtered reference for metadata review, or explicitly Import and analyze. The server rechecks active owner access. Managers cannot access or approve another artist's Gmail through this interface.
- Restoring retrieves metadata in the worker before import can be chosen. It does not fetch a body. Import requests queue IDs only; token decryption and Gmail reads remain in the worker.
- Import validates fresh metadata, allows only bounded UTF-8 plain text, ignores attachments and attached forwarded messages, and rejects HTML-only, oversized or unsupported-charset content. The Gmail HTTP response is capped at 2 MB; extracted text at 50,000 characters / 100 KB. Original text is escaped by React, not rendered as HTML.
- Payment signals take priority over known work threads and sender allow rules. Payment notices remain review-only; this pilot does not implement financial redaction or import.
- Message insertion, decision linkage and the existing analysis job commit atomically. Deduplication uses workspace plus stable Google account subject and provider message ID, so a reconnect does not create a second imported message. Repeated jobs do not read or analyze an already imported message again.
- Cancellation, disconnection and membership are checked again before committing content. Failures store bounded codes, never provider error text. Failed review/import jobs require a manual retry; the UI does not poll failed records indefinitely.
- Analysis still proposes changes for human confirmation. Import does not create a project, calendar entry, payment, or outgoing email automatically.

Migration `0031_medical_sister_grimm.sql` is additive and was generated from the schema. It adds review state/preview fields, pagination indexes, and the `gmail` message channel. Earlier migrations were preserved.

## Explicit limits before a real mailbox pilot

The verification used synthetic metadata/content and an injected queue. Real Gmail synchronization and paid model calls were not enabled. Browser checks covered intake pagination/detail loading; the gated Gmail review UI was type/lint/build checked, while its data and mutation services were exercised against local PostgreSQL.

Attachment ingestion, HTML conversion, quoted-thread/signature cleanup, payment redaction/expiry, sender-rule editing, classifier calibration and production push/watch operations remain later batches. These are not implied by a successful Gmail OAuth connection.

Disconnect behavior remains unchanged: it revokes access and deletes the connection and its decision rows; previously imported message records remain. A proposed automatic deletion of unfiled imported messages was rejected by automatic approval review because it introduced an unauthorized destructive side effect. No such deletion was implemented. A retention choice and explicit confirmation are required before enabling a real-data pilot. The inbox's existing Dismiss action remains a reversible status change; it is not a content-deletion action.

## References

The transport uses Google's documented [message retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) and [MIME message representation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages). Metadata is used for routing, while full content is requested only after explicit import.
