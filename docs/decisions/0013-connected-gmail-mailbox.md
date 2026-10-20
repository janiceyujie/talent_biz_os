# 0013 — Reading the connected Gmail mailbox, metadata first

**Status:** Accepted (2026-10-10)

## Context

The architecture planned a Gmail add-on first: the person opens an email and sends that one message in, and nothing ever scans a mailbox. That keeps the permission small, but it depends on a step people skip. Artists run their business from their inbox, and an offer that isn't sent in is an offer the system never sees.

Reading the mailbox on its own changes four things:

- **Permission.** `gmail.readonly` is a *restricted* scope. Until Google verifies the app and an independent security assessment (CASA, renewed yearly) passes, at most 100 test users can connect. Google's Limited Use policy applies to everything we read: it may be used only to provide the feature, never to train general models.
- **Volume.** About 100 emails a day per artist, most of them not work. Reading all of them costs money and reads mail we have no business reading.
- **Source.** A message no longer arrives because the person chose it. The mailbox owner is known; the sender is a claim in a header (decision 0007 still applies to everything we read).
- **Language.** Much of the mail is Traditional Chinese mixed with English. Every rule and model has to handle both.

## Decision

### Order of channels

- **The connected mailbox is built first.** The Gmail add-on stays planned and comes after it: for people who won't grant mailbox access, and for explicit "this belongs to project X" tagging. Forwarding comes later.
- Paste and upload are unchanged and go through the same queue and analysis.

### Whose mailbox, who sees it

- **One mailbox per artist account (talent) for now.** The person connecting picks *any* Google account, not only the one they sign in with: work mail often lives at a booking address. The table allows more mailboxes per talent later.
- **Everything brought in belongs to the talent,** so every member sees it, managers included. The connect screen says so: members of this account, including a manager, see the work email brought in. Finer control for members comes later.
- **A manager's own mailbox is later.** It mixes several artists, so each email would also need a "which talent is this for" step. Messages always carry a `talentId`, and the connection records whose mailbox it is, so that step can be added.

### Permission and connection

- **`gmail.readonly` only.** No send, modify, or full-access scope.
- **Its own OAuth flow,** separate from sign-in, with `state` and PKCE, on the same OAuth client as sign-in (one consent screen, one verification). The mailbox's Google account never becomes a way to sign in. Tokens: [decision 0016](0016-mailbox-tokens-and-key-management.md).

### What is watched

| Where the mail is | Treatment |
|---|---|
| Inbox, including the Promotions, Social, and Updates tabs | Watched; the tab is a hint to the relevance check, never a drop by itself (offers often land in Promotions) |
| Mail filtered past the inbox into a label | Watched |
| Sent | Only in threads already relevant, so a thread's back-and-forth is complete; a thread the artist started becomes relevant when the reply arrives, and its earlier sent messages are brought in then |
| Spam, Drafts | Ignored |
| Trash | Ignored. An email already brought in stays here if it's later trashed in Gmail; deleting here is the person's action (decision 0002) |

### How mail arrives

- **Gmail push through Pub/Sub, pulled by our worker.** A Gmail `watch` posts change notices (mailbox and history id only) to a Pub/Sub topic in our Google Cloud project; the worker pulls the subscription. No public webhook; it works on a laptop; notices wait in Pub/Sub while the worker is down.
- **Renewed and checked.** The watch is renewed daily (it lasts at most 7 days); a reconciliation poll every 15 minutes catches missed notices; **Sync now** in Settings runs the same path. (As built: renewed by the sync, and Check now in Intake; see the implementation notes.)
- **History on connect: the last 30 days by default, or "Only new mail".** It runs at low priority. Threads whose last message is older than 14 days come in grouped under "From your history", not as new cards at the top of Intake.
- **Metadata first.** For each new message: `history.list`, then `messages.get` with `format=metadata` (headers, labels, thread id, Gmail's snippet). No body yet.

### What counts as relevant

An email is relevant when it's one of the existing intents (`lib/ai/extraction/intents.ts`) for the artist's work.

| Kind | Relevant |
|---|---|
| Offers, inquiries, negotiation, confirmations | Yes |
| Contracts, including e-sign notices | Yes |
| Logistics: call times, travel, riders | Yes |
| Payment notices, invoice requests, remittance advice | Yes |
| Booking-platform notifications | Yes |
| Press, interview, and podcast requests | Yes, as an inquiry |
| Bank and payment-app notifications | Yes, on the restricted path below |
| Venue or festival open calls and newsletters | No by default; a sender rule can include them |
| Fan mail, personal mail | No |
| Receipts for the artist's own purchases | No (expenses may come with finance later) |

### The relevance check

Each email stops at the first step that's sure:

1. **Rules.** In: the sender is a contact or matches an "always" sender rule; a known e-sign or booking-platform sender. Out: spam, trash, an artist's "never" sender rule, bulk mail (`List-Unsubscribe`, no-reply) with no work keywords in either language. Rules are data, versioned, scoped globally or per artist.
2. **Thread memory.** A message in a thread already relevant is relevant.
3. **The small model** scores sender, subject, and snippet (model choice: [decision 0015](0015-production-model-providers.md)).

| Score | What happens |
|---|---|
| Above the threshold | Body and attachments fetched and analyzed; shown in Intake |
| Unsure (between the two thresholds) | **Also fetched and analyzed**; the card is flagged "Not sure this is work" with a one-click Not work |
| Below the lower threshold | Not fetched; only the decision is recorded |

Fetching the unsure band trades reading more mail for fewer clicks. Both thresholds are configuration, tuned with the relevance eval (at least half Traditional Chinese) and the Not work rate; they start generous, so they mostly control cost.

### Bringing an email in

- Body (plain text, or cleaned HTML) and attachments become a `message` (channel `gmail`) and `file` rows, in the same storage and through the same analysis as uploads, run by the queue.
- **If the analysis says it isn't work** (intent `other`, no deal content), or the person presses **Not work**, the body and attachments are deleted at once. The decision and the Gmail link stay; Not work also becomes a label for tuning.

### Payment notices: the restricted path

1. Subject and snippet first; if they carry the amount and payer, the body isn't fetched.
2. If the body is needed, code (not a model) redacts it first: account and card numbers except the last four digits, balances, ID numbers, verification codes. Only the redacted text reaches the model.
3. Attachments from these senders are never fetched.
4. Only fields are kept: amount, currency, date, payer name, the account's last four digits, the Gmail link. Never the body.
5. A notice that matches an expected payment (within a tolerance, such as withheld tax) or a known payer goes through the normal review. One that matches nothing becomes an **unmatched payment** card: Import (match it, or record a new payment on a project) or Drop (fields deleted; optionally "don't bring in notices from this sender"). Without a decision, its fields expire after 30 days.

### Threads, contacts, and stage

- Each message stores Gmail's thread id and its `Message-ID`, `In-Reply-To`, and `References` headers. A thread with a message already filed under a project makes that project the strongest target suggestion (`suggestTargets`), above contact and date.
- Each email is analyzed on its own new text, quoted history stripped, with the thread's earlier analyses as context.
- A sent reply in the thread completes that thread's reply to-do.
- A sender who isn't a contact is proposed as a new contact, on existing projects as well as new ones.
- Stage moves and field changes are proposed by the existing per-intent rules ([intake-to-project](../design/intake-to-project.md)); the person confirms every one.

### What is stored about mail not brought in

- **Ids only**: Gmail message id, thread id, received time, score, which step decided, classifier version. No sender, no subject.
- **Filtered out** in Intake lists skipped emails by fetching sender and subject from Gmail as the page opens (metadata only); nothing extra is stored. **This was work** brings one in and records a label.
- Sender rules are stored only when the artist makes one. Eval cases come from corrected emails (with consent) and made-up cases; committed eval cases stay made-up.
- Gmail's own authentication results (SPF/DKIM in `Authentication-Results`) are kept as a signal for the warning in decision 0007; the sender address is never trusted on its own.

### Disconnecting

Stop the watch, revoke the token at Google, then the artist chooses: **remove everything brought in from Gmail**, or **keep what's filed under projects and remove the rest**. Decision rows are deleted either way.

### Logs

Subjects, snippets, bodies, and tokens never go into logs, traces, or error reports; ids only.

## Alternatives considered

- **The add-on first** (the earlier plan). The smallest permission and no background reading, but the person must act on every email. Kept, after this.
- **Forwarding first.** No Google review, any provider; rewritten headers and no thread id make matching weaker.
- **An unsure card showing only sender, subject, and snippet, with the body fetched on "yes".** Reads the least; rejected for now in favor of fewer clicks.
- **An embedding classifier from day one.** Cheaper per email, but needs labelled data we don't have yet; it can run in shadow mode once Not work and This was work labels accumulate. Per artist only: Google's Limited Use rules allow a model trained on Gmail data only as that user's personalized model, never one shared across artists. The plan, and when to start: [design/embeddings.md](../design/embeddings.md).
- **Storing sender and subject for skipped mail** (for statistics and debugging). It builds a record of who writes to the artist; the live Filtered out view covers the need.
- **Leaving bank notices out.** Safest, but "was I paid?" is one of the questions this product answers.
- **The Kafka and separate-services design** in the original pipeline design doc. Sized for 500,000 users; see [decision 0014](0014-hosting-and-job-queue.md).

## Consequences

- Google verification and CASA are on the path past 100 users; start them as soon as connecting works. While the consent screen is in Testing status, refresh tokens expire after 7 days; move it to In production (still capped, with an "unverified app" warning) before others connect.
- A hosted worker is required (decision 0014).
- Reading the unsure band costs model calls and reads more mail; the thresholds are watched through `ai_call` cost and the Not work rate.
- Intake gains three kinds of card: "Not sure this is work", unmatched payment, and "From your history", plus the Filtered out view.
- The architecture's assumption that every message comes from a person's own action no longer holds for this channel; the content rules of decision 0007 are unchanged.
- Design and build order: [docs/design/gmail-ingestion.md](../design/gmail-ingestion.md).

## Implementation notes (2026-10-12)

- **Filtered out reads through the worker.** The web service can only encrypt tokens (decision 0016), so it can't call Gmail. The worker answers a private endpoint (`worker/http.ts`, `POST /mail/peek`, shared `WORKER_SECRET`) with sender and subject for up to 50 email ids, and only for ids this mailbox has a decision for. Nothing it returns is stored. Waiting (work, and not decided yet) uses the same endpoint.
- **The rules as built** (`lib/mail/relevance/rules.ts`, `RULES_VERSION`): the artist's sender rule, then a contact, then a thread already decided as work, then an e-sign service, decide work; spam, trash, drafts, sent mail, and bulk mail with no work words in either language are skipped; so is mail in the Promotions or Updates tab with no work words (`rules-2`: on the builder's first month, 31 of 55 emails left waiting were marketing and notifications sent without list headers). A tab alone still never skips: with a work word it waits, and in Promotions "offer" doesn't count as one (12 of the rest were sales). The rest is `pending` for the model step, and pending emails are decided again whenever `RULES_VERSION` changes. These rules are only the cheap first filter: the model then scores sender, subject, and preview, and the full analysis can still call an email not work. Booking platforms aren't hardcoded: they differ per artist and belong in sender rules, which only the artist's click creates, from Waiting or Filtered out.
- **The metadata read** asks Gmail for six headers (From, Subject, List-Unsubscribe, List-Id, Precedence, Auto-Submitted), the labels, and the thread, and not the snippet: the rules don't use it.
- **Skipped decisions are kept** for Filtered out, This was work, and dedupe; deleting those older than 90 days arrives with the scheduled jobs (gmail-push-backfill).
- **The model step** (`lib/mail/jobs/relevance.ts`, prompt in `lib/mail/relevance/prompt.ts`): one job per email the rules leave pending, on its own queue per mailbox, reading sender, subject, tab, and Gmail's preview (asked for only here). The model returns a score and a **kind** from a fixed list (offer, negotiation, contract, logistics, payment, press, newsletter, marketing, receipt, personal, notification, other); both are stored, never a sentence about the email. Thresholds 0.6 and 0.4 come from the relevance eval (`evals/relevance`, 36 made-up cases, two thirds Traditional Chinese): on Gemini and on a local qwen3:8b, every work case scored at least 0.8. An email whose subject or preview tries to steer the check (text addressed to an AI, or setting its own score) is never decided as work by the model: at most "Not sure", checked in code whatever the model answers.
- **Bringing email in** (`lib/mail/jobs/fetch.ts`): work and Not sure are fetched in full. The message keeps the email's new text (quoted history stripped by `lib/mail/clean.ts`, the signature kept), its sender and subject, and its thread headers. Attachments: PDFs and images within the upload limits (10 files, 10 MB each, 12 MB in all), not images shown inside the body; others are listed by name for Open in Gmail. The analysis reads the sender and subject with the text.
- **Not work by the analysis** needs more than intent `other`: also no dates, fee, payment terms, details, asks, or flags (`notWork` in `lib/ai/analysis.ts`), since thanks after a show with photos is still work. The person's **Not work** can also add "never from this sender"; **This was work** in Filtered out brings an email in; **It's work** clears Not sure. Each is recorded on the decision (`person`).
- **Disconnect** asks whether to keep what's filed under projects (the default) or remove everything; decisions go either way.
- **Payment notices** (`lib/mail/payment-notice/`, `lib/mail/jobs/notice.ts`). The relevance model has a kind for them, `bank_notice` (an automated notice from a bank or payment app about money moving in the person's account), apart from `payment` (a person or company writing about one, which takes the normal path). A `payment` email sent by a machine (bulk or no-reply) is treated as a `bank_notice` too: the restricted path keeps less, so it's the safe side when unsure. A bank notice's thread never makes the rest of the thread work, since a bank's notices often share one. An email brought in without the model (a contact, an "always" sender, This was work) has no kind; if it's machine-sent, the model gives it one before anything else is read, so a bank address saved as a contact still takes the restricted path. A person's own email skips that call. The text is masked in code (account and card numbers to their last four digits, balances, ID numbers, codes, links) before the model reads it; the model returns the fields, and code keeps each only when it finds it in the masked text, so a misread number is left blank rather than recorded. Money out (a card charge, a transfer sent) and a notice with no amount keep nothing but the decision; when the notice's wording is one-sided (spending words only, or deposit words only), code decides the direction, since the local model read a made-up card charge as money in. The notice is a `message` of kind `payment_notice` with only those fields, the sender, and the Gmail link; a check constraint refuses a body on one. In Intake it's a row among the other mail; its card suggests the expected payment it matches: income still expected, short of the expected total (tax included) by no more than NT$30 or 1%, a transfer fee; when two match, the payer's name against the project's people decides, or nothing is suggested. **Mark as received** settles the payment picked with what arrived and when, or records a new one on a signed project; **Drop** is Not work. These calls don't count toward the person's AI limits, like the relevance check.
- **Threads** (`intakeContext` and `suggestTargets` in `lib/domain/intake.ts`). A message in a thread with one already filed under a project gets that project as its top suggestion ("Same email thread"), above every other sign; when more of the thread waits in Messages, **File all** files them under it, oldest first, each with the items its review would start ticked; one that asks whether they signed is left for review. A sender who isn't on the project is proposed as a change, ticked: linked when the address is already a contact, created otherwise. **The person's own replies** in a work thread come in as `direction` `sent` (they were brought in before this, as if received, because the thread rule runs before the sent rule), with the To line in `recipients`. They're analyzed with their own prompt (`SENT_PROMPT_VERSION` in `lib/ai/prompts.ts`: the artist's side, their quote ticked rather than left as a proposal, no reply to-do or questions), never dropped as not work, and filed under the thread's project at once when they propose nothing (`proposesNothing`); otherwise they wait in Messages, marked Your reply. A reply marks the thread's earlier reply to-dos done (`todo.completed_by_message_id`), with Undo on the reply; a message filed after the person already replied gets no reply to-do. The timeline shows both sides.
- **Mail arrives on its own** (`worker/push.ts`, `worker/schedule.ts`, `lib/mail/jobs/reconcile.ts`). Push is used when `PUBSUB_TOPIC`, `PUBSUB_SUBSCRIPTION`, and `GCP_PUBSUB_CREDENTIALS` are set; then the poll runs every 15 minutes as a safety net. Without them the worker polls every 2 minutes, so development needs no Cloud setup; a check with nothing new is one Gmail call per mailbox. The watch is started and renewed by the sync itself, a day before its 7 days end, rather than by a daily job: every connected mailbox syncs at least every 15 minutes. Connecting starts the first sync. Intake shows "Checked 2 min ago" with an explanation and Check now, in place of Sync now. A daily cleanup deletes skipped decisions after 90 days (Filtered out shows at most that far back), payment notices left unhandled for 30 days, and jobs that gave up more than 14 days ago.
- **Thread context in the analysis** (`threadNotes` in `lib/ai/analyze-message.ts`, `threadBlock` in `lib/ai/prompts.ts`). An email in a thread is analyzed with notes on up to 5 earlier messages in it, oldest first: who wrote each (the other side or the artist), when, and what its stored analysis extracted (intent, fee, dates, asks), never their text. The prompt treats them as background: references like "the same fee" or "that Saturday" are resolved from them and noted in assumptions; earlier terms the email doesn't mention aren't repeated.
- **From your history** (`fromHistory` in `lib/mail/jobs/fetch.ts`, status `history`). An email the connect-time read of the last 30 days decided on, in a thread whose latest email is over 14 days old, is brought in with status `history` and not analyzed: Intake lists those in a collapsed "From your history" group below Messages, outside the badge, and opening one analyzes it (`openFromHistory`). An email the person brings in themselves, and anything later syncs find, comes in as usual.
- **Sender authentication** (`lib/mail/sender-auth.ts`, `message.sender_check`). At fetch, Gmail's own Authentication-Results header (the topmost, from mx.google.com; forged ones can only sit below it) gives a verdict: failed when DMARC failed or both SPF and DKIM did, verified when DMARC passed, otherwise unknown, since many small senders don't sign. A failed verdict adds the code-raised flag `unverified_sender` first in the warning strip, worded more strongly when the email also asks about payment or bank details. It never lowers the relevance score: a real client's misconfigured domain still comes in.
