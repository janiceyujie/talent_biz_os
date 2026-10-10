# 0016 — Mailbox tokens: envelope encryption with Cloud KMS

**Status:** Accepted (2026-10-10)

## Context

Reading a mailbox while the artist isn't in the app (decision 0013) needs a Google **refresh token**: access tokens last about an hour, and every sync, watch renewal, and poll happens in the background. With `gmail.readonly`, a stolen refresh token reads the whole mailbox, old mail included, until it's revoked. It can't send, delete, or change mail.

Google Calendar (decision 0009) keeps its tokens in Better Auth's `auth_account`, encrypted with the auth secret, on the Google account the person signs in with. That doesn't fit Gmail:

- The mailbox can be **any Google account** (a booking address, a mailbox shared with a manager). Linked in `auth_account`, it would become a way to sign in: anyone who can open a shared booking mailbox could sign into the artist's account.
- One key held in the environment, shared by every process, gives no separation between the part that saves tokens and the part that uses them, no audit trail, and no instant off switch.

Google's security assessment (CASA) examines exactly this storage.

## Decision

### What is stored

- **Only the refresh token**, in our own `mail_connection` table, never in `auth_account`. Access tokens are kept in the worker's memory and never written anywhere.
- **Envelope encryption.** Each connection gets a random 256-bit **data key**. The refresh token is encrypted with it (AES-256-GCM: ciphertext, nonce, authentication tag). The data key is stored **wrapped** (encrypted) by a **master key** in Google Cloud KMS, with the master key's id and version.
- The master key's material never leaves KMS. Rotating it, or moving to another key service, re-wraps data keys in the background; tokens are not re-encrypted.

### Who can do what

| Process | KMS permission | Why |
|---|---|---|
| Web service | **Encrypt only** | The OAuth callback wraps a new data key, encrypts the refresh token, saves the row, and drops the readable token. It can never read a token back |
| Worker | **Decrypt only** | Unwraps a connection's data key (cached in memory for a few minutes), decrypts the refresh token, asks Google for an access token |

Each service has its own Google service-account credential in Render's environment. The Pub/Sub subscriber credential is separate again, and the worker's only.

### Where it runs

- **Cloud KMS in Singapore (`asia-southeast1`)**, in the Google Cloud project we already need for Gmail OAuth and Pub/Sub. From the first deployment, so there's nothing to migrate later.
- **Locally**, a `KeyProvider` interface with an `.env`-key implementation, so no Google Cloud is needed on a laptop. The app refuses to start with it when `APP_ENV` isn't `development`.

### Around the token

- Tokens are never logged or put in error reports.
- **Disconnect** revokes the token at Google and deletes the row (with the choice of decision 0013 for what was brought in).
- **Revocation from Google's side** (the artist removes access, or Google invalidates the token) shows up as `invalid_grant` on the next refresh: the connection becomes "Reconnect needed", retrying stops, and Settings asks the artist.
- **Kill switch**: disabling the master key in KMS stops every connection at once, without waiting for revocation at Google. A script revokes every token at Google if a leak is suspected.

### The OAuth client

- The same OAuth client (type "Web application") as sign-in and Calendar, with the Gmail callback added to its authorized redirect URIs. The flow uses `state` and PKCE.
- The client secret is in Render's environment for both services: the web service exchanges codes, the worker refreshes tokens. If it leaks, a new secret is generated in the console; existing refresh tokens keep working.

## Alternatives considered

- **No stored token**: sync only while the artist has the app open. Brings back the manual model decision 0013 moves away from.
- **Better Auth's `auth_account`**, like Calendar. No new storage, but any linked mailbox account becomes a sign-in method, and the key is shared by every process.
- **A master key in Render's environment instead of KMS.** Simpler, but the key sits beside the credentials that use it: no separate encrypt and decrypt permissions, no audit log, no instant off switch.
- **AWS KMS.** Equivalent, but needs an AWS account; Supabase's own AWS account isn't ours.
- **Google Workspace domain-wide delegation.** Only for Workspace admins, and it grants more access, not less.

## Consequences

- Reading mail takes both the database and the worker's environment, plus a KMS call that appears in the audit log; either alone reads nothing.
- The KMS credentials are still secrets in Render's environment, narrower ones: one key, one direction, logged on every use, revocable at once. Signing in to Google from Render without a stored credential (workload identity federation) is worth checking later.
- Costs pennies a month (a key version plus operations, with data keys cached briefly).
- Calendar tokens stay in `auth_account` as decision 0009 describes; they can move to this pattern if there's a reason.
- A diagram of the flow: [Gmail Token Flow](https://claude.ai/artifact/2Moj4sPrnpJxh1Uc2r4kVg) (private; open it from the owner's account or share it from its page).
