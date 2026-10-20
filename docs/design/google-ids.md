# Reference: Google ids in Intake

**Status:** Reference (2026-10-20, with migration 0038). Every id we get from Google, or make to tie Google's to ours, for sign-in, the connected mailbox, Google Calendar, and Intake: who issues it, how far it's unique, where it's kept, and what it's for. The why is in [decision 0009](../decisions/0009-google-calendar-sync.md) (calendar), [0013](../decisions/0013-connected-gmail-mailbox.md) (mailbox), [0016](../decisions/0016-mailbox-tokens-and-key-management.md) (tokens), and [0017](../decisions/0017-two-way-google-calendar.md) (two-way calendar).

Two rules run through it:

- **Identify a Google account by its user id (`sub`), never its email.** An email can change; the user id can't.
- **A Gmail id means something only in its own mailbox.** The same email in two mailboxes has two Gmail ids. Only the `Message-ID` header is the same in both, and the sender writes it, so it's a hint, never proof (decision 0007).

## Google accounts

| Id | Issued by, unique within | Kept in | For |
|---|---|---|---|
| Google user id (`sub`) | Google; unique across Google, never changes | `auth_account.account_id` (provider `google`: signing in)<br>`mail_connection.account_subject` (the connected mailbox)<br>`gmail_addon_link.google_subject` (a Gmail account linked to the add-on; unique: one person each)<br>`message.mailbox_subject` (the mailbox an email is from, by either channel) | Which Google account. Calendar uses the sign-in row, through `calendar_connection.auth_account_id` (decision 0009); the mailbox keeps its own, so it can be any account and never becomes a way to sign in (decisions 0013, 0016) |
| Google account email | Google; the person can change it | `person.email` (signing in)<br>`mail_connection.account_email`<br>`gmail_addon_link.google_email` | Shown to people. Pub/Sub notices name the mailbox by it; Open in Gmail links pass it as `authuser`. Never trusted as identity |

## Gmail

| Id | Issued by, unique within | Kept in | For |
|---|---|---|---|
| Gmail message id | Gmail; **one mailbox** | `message.external_ref`, with `message.mailbox_subject`<br>`mail_decision.provider_message_id`, unique with `connection_id`<br>`message.dedup_key` = `gmail:{sub}:{gmailId}` | Fetching, never deciding or bringing in twice, Open in Gmail (`#all/{id}`). The add-on's event carries the same id for its mailbox (`gmail.messageId`) |
| Gmail thread id | Gmail; one mailbox | `message.provider_thread_id`, scoped by `mailbox_subject`<br>`mail_decision.provider_thread_id` | Thread memory (later mail in a thread already relevant), File all, the add-on's whole conversation |
| `Message-ID`, `In-Reply-To`, `References` headers | **The sender's mail server**; meant to be unique everywhere, guaranteed by no one, can be missing or forged | `message.header_message_id`, `in_reply_to`, `references` | Threading replies. The add-on matches a copy from another mailbox on `Message-ID` only with the same sender and arrival within minutes |
| `historyId` | Gmail; a cursor that only grows, one mailbox | `mail_connection.history_id` | Where the next sync continues. A Pub/Sub notice carries only `emailAddress` and `historyId`; the notice itself isn't kept |
| Watch expiry | Gmail | `mail_connection.watch_expires_at` | Renewing the push watch daily |
| Attachment id | Gmail; one message | Not kept: used once, while fetching | Downloading an attachment's bytes; from then on it's our `file.id` |
| Label ids (`INBOX`, `CATEGORY_PROMOTIONS`, …) | Gmail | Not kept: read while scoring | Telling the relevance model which tab an email is in |
| Pub/Sub topic name | Us, in our Google Cloud project | An environment variable | Registering the Gmail watch |

## Google Calendar

| Id | Issued by, unique within | Kept in | For |
|---|---|---|---|
| Calendar id | Google; unique across Google | `calendar_connection.external_calendar_id` (our Talent Biz OS calendar)<br>`calendar_import_source.external_calendar_id` (the person's own calendars they chose to show) | Which calendar to write to or read |
| Event id | Google; one calendar | `calendar_event_sync.external_event_id` (our events, pushed)<br>`external_event.external_event_id` (events read in; each occurrence of a repeating event has its own) | Two-way sync, showing chosen calendars |
| `recurringEventId` | Google; one repeating event as a whole | `external_event.series_id`<br>`calendar_series_project.series_id` | Adding a whole repeating event to a project (decision 0017) |
| ETag | Google; changes with every edit | `calendar_event_sync.etag` | Telling whether Google's copy changed |
| `syncToken` | Google; a cursor | `calendar_connection.sync_token`<br>`calendar_import_source.sync_token` | Reading only what changed |
| `htmlLink` | Google | `external_event.html_link` | Open in Google Calendar |
| Push channel id, resource id | Google | Not yet: calendar push notifications aren't built | Receiving calendar change notices |

## Ours, tying them together

| Id | For |
|---|---|
| `talent.id`, `person.id` | Every row of a talent's data is scoped by `talent_id`; `person_id` is who did it |
| `mail_connection.id`, `calendar_connection.id` | One row per connection. Not in the Gmail dedup key: a reconnect makes a new one |
| `message.id` | One message in Intake. `mail_decision.message_id` points to it once brought in; so do `file.message_id` and `ai_call.message_id` |
| `message.dedup_key` | Unique with `talent_id`. By channel:<br>• `gmail:{sub}:{gmailId}`: email from Gmail by either channel, payment notices included (`lib/mail/dedup.ts`). Email kept from a mailbox disconnected before migration 0038 still has the old `gmail:{connectionId}:{gmailId}`<br>• `upload:{sha256 of the files' bytes, in order}`<br>• `paste:{sha256 of the text, line endings and runs of spaces evened out}` |
| `file.id`, `file.storage_key` | `files/{talent_id}/{id}`; replaces Gmail's attachment id once stored |

## The Gmail add-on

What the add-on ([design](gmail-addon.md)) adds:

| Id | From | Kept in |
|---|---|---|
| Google user id (`sub`) | The user id token Google sends with every add-on request | `gmail_addon_link.google_subject`; `message.mailbox_subject` on what it sends |
| Gmail message id, thread id | The add-on event (`gmail.messageId`; the thread from Gmail when the event has none) | `message.external_ref`, `provider_thread_id`, channel `gmail_addon` |
| Link token | Ours: 32 random bytes in the Connect URL, once | `gmail_addon_link_request.token_hash` (SHA-256 only), 10 minutes |
