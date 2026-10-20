# Design: the Gmail add-on

**Status:** Built (2026-10-20), not deployed: no Google deployment exists yet, so the parts to prove in a prototype are marked **Verify**. Builds on [decision 0001](../decisions/0001-sign-in-methods-and-account-linking.md) (sign-in and linking), [0007](../decisions/0007-untrusted-message-content.md) (untrusted content), [0013](../decisions/0013-connected-gmail-mailbox.md) (the connected mailbox), and [intake-to-project](intake-to-project.md) (review). Ids: [Google ids in Intake](google-ids.md).

## The point

The connected mailbox reads a whole mailbox's metadata to find the work in it. Some people won't grant that. The add-on is for them: in Gmail, with an email open, they send that one conversation to Talent Biz OS, and can say which project it belongs to on the way in. Nothing else in the mailbox is read.

It also serves people who have connected their mailbox: it's the quickest way to send in something the relevance check filtered out, or to say which project an email is for.

## What it does

| | In v1 | Later |
|---|---|---|
| Send the open conversation to Intake | ✅ The whole thread, with its attachments | |
| Pick an existing project on the way | ✅ Optional; without one, the project is chosen in Intake as today | |
| Show where an email already is | ✅ Waiting in Intake, filed under a project, or dismissed | |
| Create a new project from the card | | After v1; the card gets a New project option |
| Move a filed email to another project | | Needs moving a message between projects in the app first; it doesn't exist (see [Open questions](#open-questions)) |
| Pick which artist, for a manager of several | Any artist the person is an active member of; the picker shows at two or more. With today's onboarding, that's one | With manager access ([below](#managers-and-several-artists)) |
| Show the analysis in Gmail | ❌ Never: review happens in Talent Biz OS | |

**No relevance check.** The person chose to send it, so it's work: it skips the rules and the relevance model (decision 0013) and goes straight to analysis, like a paste or an upload. Analysis still runs, because Intake's proposals come from it.

**The project is a choice, not a filing.** Picking a project doesn't apply anything to it. The messages wait in Intake with that project already chosen; the person confirms the proposals there, as for any message (decision 0007: a person confirms everything extracted). The card says so, and links there.

## Why a Workspace add-on

Chosen over a Chrome extension and an email-forwarding address:

- **It works in Gmail's mobile apps too**, not only in Chrome on a computer.
- **The narrowest access Google offers:** `gmail.addons.current.message.readonly` reads only the open message and the rest of its thread ("also grants access to the content of other messages in the open thread"), and only while the add-on runs. A Chrome extension would either scrape Gmail's page (breaks when Gmail changes; attachments are hard) or need `gmail.readonly`, the full-mailbox scope this feature exists to avoid.
- **It runs on our server.** An HTTP add-on (Google's "alternate runtime") is a JSON endpoint; Google renders the cards. No Apps Script.

The cost: the card is built from Google's widgets (text, buttons, dropdowns), not our own HTML. Forwarding stays a possible later channel (`forwarded_email` in `docs/architecture.md`).

## How it fits

```mermaid
sequenceDiagram
    actor P as Person
    participant G as Gmail
    participant A as Add-on endpoint<br/>(our route handler)
    participant API as Gmail API
    participant DB as Postgres
    participant W as Worker

    P->>G: opens an email
    G->>A: contextual trigger: messageId, threadId,<br/>user and system id tokens, access tokens
    A->>A: verify both id tokens; sub → linked person
    A->>DB: is this thread already in? (ids only)
    A-->>G: card: where it is, or the send form
    P->>G: picks a project, presses Send
    G->>A: card action
    A->>API: read the thread and attachments<br/>(the add-on's short-lived tokens)
    A->>DB: message + file rows, chosen project,<br/>queue message.analyze (one transaction)
    A-->>G: card: sent, confirm in Talent Biz OS
    W->>W: message.analyze (as for an upload)
    P->>P: Open in Talent Biz OS → Intake review,<br/>project already picked
```

The fetch happens in the request, not in the worker: the tokens Google gives the add-on last only for that interaction, and we don't keep a refresh token. **Verify** that a thread with attachments up to our limits (`FETCH_LIMITS`, the same as uploads: 10 files, 10 MB each, 12 MB in all) reads and stores within the time Google allows a card action. If it doesn't, Send has to read a thread in parts ([Open questions](#open-questions)).

## Linking a Gmail account to a person

The add-on runs under whichever Google account is open in Gmail. That account may not be the person's sign-in account: often it's a booking mailbox. So the first time, the Gmail account is linked to a Talent Biz OS person. Linking never makes the Gmail account a way to sign in (decisions 0001, 0013).

### The first time

1. **Google's consent.** On first use Google shows its own screen for the add-on's scopes. Ours comes after.
2. **Already known?** Google sends a signed user id token with every request; its `sub` is the Google account's id.
   - If a person signs in with that same Google account (`auth_account.account_id` = `sub`, provider `google`), that's already proof it's them: the link is made at once, and the card shows the main view.
   - Otherwise the card says Connect to Talent Biz OS.
3. **Connect.** The button opens our site (`openAs: OVERLAY`, `onClose: RELOAD`; a browser tab on phones) at `/addon/link?token=…`: a random one-time token, stored only as its SHA-256 with the verified `sub` and address (`gmail_addon_link_request`), valid for 10 minutes. The URL carries no account.
4. **Sign in, as usual.** With a password, or with Google (always `prompt=select_account`). **Signing up isn't offered here:** Google sign-in runs with `disableImplicitSignUp`, and only the sign-up and ordinary sign-in pages ask for a new person (`requestSignUp`). Otherwise Google might pick the booking account open in the browser, decision 0001 would create a new, empty person for it, and the add-on would be linked to that. A Google account we don't know is told to sign in with their usual account (`signup_disabled`).
5. **Confirm on our site.** One page shows both: "Link the Gmail account booking@… to your Talent Biz OS account janice@…?", with Sign out for the wrong account. Confirming claims the request for this person.
6. **Confirm in the card.** Back in Gmail (the card reloads on a computer; on a phone the person refreshes it), the card asks once more: "Link this Gmail account to janice@…?". Only that Gmail account can answer, so a Connect URL that leaks (forwarded, in a browser history) can't link someone's Gmail to another person's account.
7. **Told by email.** Every new link emails the person, so a link they didn't make doesn't go unseen; Settings lists the links, with Unlink.

A person who hasn't finished onboarding (no artist yet) is sent there after linking; until then the card says to finish setting up, with no Send.

### The rules

- **One person, any number of Gmail accounts.** Each Gmail account linked is its own row, listed in Settings with Unlink.
- **One Gmail account, one person at a time.** Every message sent in records who sent it (`submitted_by`), so the account can't be ambiguous. The card shows who it's linked to, with Change account (unlink, then connect again). People sharing one mailbox's password replace each other's link; the card always says whose it is.
- **Unlinking** deletes the link row only. Messages already sent in stay, as they're the artist's data.
- **No tokens kept.** The add-on gets fresh short-lived tokens with each request, so no refresh token is stored, and there's no "needs reconnecting": the Testing consent screen's 7-day expiry doesn't apply.

## The card

Text comes from `messages/*.json` (`addon`), in the linked person's language (`person.locale`).

| State | Shows | Actions |
|---|---|---|
| Not linked | What Talent Biz OS does with the email | Connect to Talent Biz OS |
| Confirmed on our site | Link this Gmail account to {person}? | Link, Cancel |
| Linked, no artist yet | Finish setting up first | Open in Talent Biz OS |
| Not in Talent Biz OS | Artist (only with two or more; changing it redraws the card); Project: open projects, most recently changed first, defaulting to Decide in Intake; a line that the whole conversation and its attachments are sent | Send to Talent Biz OS |
| Just sent | "Sent 3 emails to Intake." With a project: "Confirm the details in Talent Biz OS to file them under {project}" | Open in Talent Biz OS (`/inbox?message=<id>`) |
| In already | Filed under {project}, waiting for review, or dismissed | Open in Talent Biz OS |
| Part of the thread in | Where the rest is, and "2 new emails in this conversation" | Send the new ones (same form) |
| A payment notice | Payment notices come in through the connected mailbox only | none |
| Homepage (no email open) | Open an email to send it in | Open in Talent Biz OS |

Every card ends with "Linked to {person}" and Change account. The project dropdown lists up to 50 projects; longer lists may need an autocomplete (**Verify** which the HTTP runtime supports). Every id in a card action (artist, project) is checked again on the server, never trusted from the card. Text from the email or the person is escaped, since Google reads a little HTML in card text.

## Bringing a thread in

What Send does, in one request (`lib/addon/thread.ts`):

1. **Who and where.** The linked person; the artist they picked (or their only one) among their active memberships; the project, if picked, checked to belong to that artist and not be archived.
2. **Read the thread** through the Gmail API with the add-on's tokens (the person's, and `X-Goog-Gmail-Access-Token` for the open message), every message in the shape the mailbox already parses (`lib/mail/gmail/parts.ts`). The person's own replies come in as sent messages, as they do from the mailbox. At most the newest 50.
3. **Skip what's already in** (below).
4. **Write**, per new email, in one transaction: the `message` row (channel `gmail_addon`, `mailbox_subject` the Gmail account), its files, the chosen project, and a `message.analyze` job, as the mailbox's `mail.fetch` does.
5. **The open email and newer are analyzed; older ones come in as history** (`status = history`, analyzed when opened), as the mailbox's first read of the past does. A long thread doesn't spend the day's analyses (`AI_DAILY_ANALYSES`).
6. **A picked project goes on every unfiled email of the thread**, those in already included.

### Already in?

Every email from Gmail, by either channel, keys on the mailbox's Google account: `dedup_key = gmail:{sub}:{gmailId}` and `mailbox_subject = sub` (`lib/mail/dedup.ts`). From the artist's connected mailbox, the add-on makes the very key `mail.fetch` would, so the two can't make two rows.

| | Match by |
|---|---|
| The same Gmail account | The Gmail id: exact |
| A copy in another mailbox | The `Message-ID` header within the same artist, only with the same sender and arrival within 10 minutes |

The `Message-ID` header is the sender's to write and can be missing or forged, so a match on it alone never skips an email: the worst case is a duplicate, never a lost email.

From the connected mailbox's own account, an email the relevance check filtered out is now work: its `mail_decision` becomes `work`, `decided_by = person`, linked to the new message.

### Email, by either channel

What made the mailbox's email email now covers both channels (`isEmailChannel` in `lib/mail/channel.ts`): the sender and subject in what the model reads, the thread's earlier analyses, `fromMailbox` (real mail never goes to a provider that may keep it), the person's own reply filed with its thread, Intake's email view, Open in Gmail, and Not work (body and files deleted, as Limited Use asks of data no longer needed). Two things stay the mailbox's only:

- **The analysis never drops an add-on email** as not work: the person chose to send it; they can press Not work themselves.
- **Disconnecting the mailbox removes only what it brought in** (`channel = gmail`). Add-on email isn't tied to the connection.

Threads are scoped by `mailbox_subject` and Gmail's thread id, not the connection, so a thread keeps its memory across a reconnect and across both channels.

### Payment notices

The restricted path (fields only, decision 0013) runs inside the mailbox's jobs, on its decisions. For now the add-on doesn't send a notice in: one the mailbox already called a bank notice, or from a sender whose notices are in already, gets "Payment notices come in through the connected mailbox only". A bank the add-on hasn't seen before isn't recognized: making the notice path work without a mailbox decision is later work.

### Opening it in Gmail

Intake's Open in Gmail opens the email in its own mailbox (`authuser`): the connected mailbox's address, or the linked add-on account's, found by `mailbox_subject`.

## Data

In migration `0038_gmail_addon`:

```text
gmail_addon_link                          one per linked Gmail account
  id                uuid pk
  person_id         uuid → person, cascade
  google_subject    text, unique          the Gmail account's `sub`: one person at a time
  google_email      text                  shown, and Open in Gmail's authuser; refreshed on each use
  last_talent_id    uuid → talent, set null   the artist sent to last, the picker's default
  last_used_at, created_at

gmail_addon_link_request                  a Connect in progress, 10 minutes
  token_hash        text pk               SHA-256 of the one-time token in the Connect URL
  google_subject, google_email            the Gmail account, from its verified id token
  person_id         uuid → person, cascade    set when confirmed on our site; the card confirms the rest
  expires_at, created_at

message
  + mailbox_subject    text               the Google account of the mailbox an email is from, by either channel
  + chosen_project_id  uuid → project, set null   the project the person picked before analysis
```

Both tables have RLS on with no policies, as every table: the server reads them, nobody else.

**The dedup key changed** from `gmail:{connectionId}:{gmailId}` to `gmail:{sub}:{gmailId}`. That also fixes a bug: disconnecting with Keep filed, then connecting again, gave the mailbox a new connection id, and its first read of the last 30 days brought filed email in a second time. The migration rewrites the key, and sets `mailbox_subject`, for email whose connection still exists; email kept from a mailbox already disconnected has no account left to read, so it keeps the old key.

**Why `chosen_project_id`, not `project_id`:** `project_id` means filed, set when the person confirms (`lib/actions/intake.ts`). The pick before analysis is a different fact: the review's top suggestion (`suggestTargets`, reason `chosen`), ahead of the thread's own project. It's also the "what the person said" label [embeddings](embeddings.md) asks to collect.

This replaces the `inbound_grant` table sketched in `docs/architecture.md`: the full-mailbox grant became `mail_connection`, and an add-on grant holds no token, so all that's left of it is the link.

## Security

- **Every request is checked to be Google's** (`lib/addon/request.ts`). The system id token (the `Authorization` header, or the event's `systemIdToken`): signed by Google, audience our endpoint, from the add-on's service account (`GMAIL_ADDON_SERVICE_ACCOUNT`). Then the user id token: audience the add-on's OAuth client (`GMAIL_ADDON_CLIENT_ID`), giving `sub`. Checked against Google's published keys with Node's crypto (`lib/addon/id-token.ts`). Nothing else in the request identifies anyone. Unset, the endpoint answers 404; `GMAIL_ADDON_TEST_STUB=1` accepts unsigned tokens outside production, as `GOOGLE_TEST_STUB` does for sign-in.
- **Scoped like everything else.** Every read and write is limited to the linked person's active memberships.
- **The link can't be forged or replayed:** a one-time token, stored hashed, 10 minutes, confirmed on both sides (above), and an email for every new link.
- **Untrusted content** (decision 0007). The card shows nothing the model made; the messages are analyzed as any other, the model has no tools, and a person confirms in Intake.
- **Real mail is mailbox content**: analyzed as `fromMailbox` (above).
- **Logs** keep ids and codes only, never a sender, subject, or body.
- **Not yet:** a rate limit per Google account on the endpoint.

## Managers and several artists

The card needs to send to the right artist. Today a person has one artist: onboarding makes one, and there are no invitations. `getCurrentTalent` takes the first active membership with no order: fine while there's only one, nondeterministic once there are two.

Timothy's branches (`user/timothy0324/daily-reminder-experience`, his decisions 0018 and 0020) add manager access: invitations by the artist, and a read-only combined view of up to three artists, behind a local-only flag. The add-on doesn't wait for it, and it doesn't cover what the add-on needs:

- **It's read-only.** Sending an email to an artist's project is a write; that branch keeps writes in the person's own workspace and leaves editing for another artist undesigned.
- **It reverses today's access rule** (any active membership edits) to owner-only editing: a product decision to make on its own.
- Its migrations (0035, 0036) and decision numbers (0018) collide with `main`'s; its plan table (`manager_entitlement`) settles pricing that isn't decided; it comes in one 505-file branch with grants, invoices, and tax.

So the add-on sends to any artist the person has an active membership in, with the picker shown at two or more: with today's onboarding, that's their one. Managing several artists, writes included, gets its own design starting from the data model, with that branch as a reference; it's also where `getCurrentTalent` gets its order.

## Publishing

| Step | What | |
|---|---|---|
| Prototype | An HTTP deployment installed for our own accounts (`gcloud workspace-add-ons deployments install`), no review, in the same Google Cloud project as sign-in | Proves the **Verify** items |
| Scopes | `gmail.addons.execute`, `gmail.addons.current.message.readonly`, `userinfo.email` (for the user id token) | Google's page doesn't list the current-message scopes as restricted, so no security assessment (CASA) is expected. **Verify** whether they're sensitive, which needs OAuth verification |
| Listing | Google Workspace Marketplace, public | Marketplace review: listing, privacy policy, and the Limited Use disclosure, as for the mailbox |

The add-on has no code of its own at Google: it is a deployment (a JSON manifest: name, logo, the Gmail trigger, the scopes, and our endpoint's URL) that tells Google where to send each card request. The steps to a listing:

1. **A public HTTPS address** for the app (the deployed site; for the prototype, a tunnel to `next dev` works). Google can't reach localhost.
2. **In the Google Cloud project:** enable the Google Workspace Add-ons API and the Gmail API, write the manifest (`deployment.json`, not written yet), and create it with `gcloud workspace-add-ons deployments create`.
3. **Our env vars:** `GMAIL_ADDON_SERVICE_ACCOUNT`, the project's add-on service account (`gcloud workspace-add-ons get-authorization`), which signs the system id token; `GMAIL_ADDON_CLIENT_ID`, the user id token's audience. Until both are set, the endpoint answers 404.
4. **The prototype:** `gcloud workspace-add-ons deployments install` installs it for the account running the command only. Prove the **Verify** items below.
5. **The listing:** enable the Google Workspace Marketplace SDK, point its app configuration at the deployment, and fill the store listing (icons, screenshots, description, privacy policy, terms, support link). Visibility: public, or private to one Workspace domain (not open to `gmail.com` accounts). Google reviews public listings, and the OAuth consent screen has to be verified for the scopes.

People then install it from the Google Workspace Marketplace, or in Gmail from the side panel's Get add-ons; a Workspace admin can install it for everyone in a domain. It appears in Gmail's side panel on a computer and under an open email in Gmail's mobile apps, and the first use runs [Linking](#linking-a-gmail-account-to-a-person).

**Verify**, in the prototype, before relying on it:

- The response shapes (`action.navigations[].pushCard` for a trigger, `renderActions … updateCard` for a button), and the event's field names (`gmail.messageId`, `threadId`, `accessToken`; `authorizationEventObject`).
- Where the system id token comes (the header or the event), and the user id token's audience.
- Reading a thread with `X-Goog-Gmail-Access-Token`, and how long Google waits for a card action: a thread with attachments up to the limits (`FETCH_LIMITS`, as uploads) has to be read and stored within it.
- The homepage on Gmail's mobile apps; `onChangeAction` on a dropdown.

## Built

| Part | Where |
|---|---|
| The endpoint | `app/api/addon/gmail/route.ts` |
| Cards, the request, tokens | `lib/addon/cards.ts`, `event.ts`, `request.ts`, `id-token.ts` |
| Linking | `lib/addon/link.ts`, `app/(auth)/addon/link/`, `lib/actions/addon.ts`; sign-in's `next` and `signup_disabled` |
| Sending a thread | `lib/addon/thread.ts`, `gmailAddonReader` in `lib/mail/gmail` |
| Email by either channel | `lib/mail/channel.ts`, `lib/mail/dedup.ts`; analysis, Intake data, Not work, disconnect |
| Settings | `components/views/gmail-addon-settings.tsx` |
| Intake | `chosenProjectId` and the `chosen` reason in `lib/domain/intake.ts`; Open in Gmail per email |

Not built: the project page's list of email waiting for review, the deployment manifest, and a decision record (after the prototype).

The card's count of new emails is what Send would bring in: it reads the thread's headers only (`format=metadata`, `From` and `Message-ID`) and applies Send's own rules, so a copy from another mailbox or a payment notice isn't counted.

## Picking this up

Parked on 2026-10-20, built but never run against Google. In order:

1. **Migration 0038** (`drizzle/0038_gmail_addon.sql`) adds the add-on tables and rewrites Gmail messages' `dedup_key` to `gmail:{sub}:{gmailId}`. Apply it (`npm run db:migrate`) before running the app on this code; a message whose mailbox connection is gone has no `sub` to use and keeps its old key.
2. **Rebase on main**, after the Inbox reader PR (#19) merges: both change Open in Gmail in `components/views/inbox.tsx`.
3. **The prototype** ([Publishing](#publishing), steps 1–4), then the **Verify** items, then fix what they disprove. Start reading at `app/api/addon/gmail/route.ts`; the request checks are `lib/addon/request.ts`, and `GMAIL_ADDON_TEST_STUB=1` lets made-up tokens through outside production for local tests.
4. **Then:** a rate limit on the endpoint (where to count is undecided: memory doesn't survive restarts or several servers); the project page's list of email waiting for review; the decision record; the listing (step 5).

Later, each its own design: moving a filed message, a new project from the card, payment notices without a connected mailbox, and managers with several artists (which artist `getCurrentTalent` picks has no order yet).

## Open questions

- **Moving a filed message.** Filing applies the proposal's items (to-dos, events, payments, a stage) to the project. Moving the message later raises what happens to those: stay, move, or be undone. To decide in the app first; the card's Change project follows.
- **New project from the card**, after v1: a title field, or open the app's form with the message attached.
- **Payment notices without a mailbox**: the notice path, its 30-day expiry included, without a `mail_decision`.
- **Time limit** on a card action, and whether a large thread needs to send in parts. Prototype first.
