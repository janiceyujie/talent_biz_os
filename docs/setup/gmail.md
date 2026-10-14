# Setting up the Gmail connection

The Google side of Settings → Connected services → Gmail: reading the mailbox an artist connects. Do [Google sign-in](google-sign-in.md) first: Gmail uses the **same Google Cloud project and OAuth client**, with its own consent and its own callback. The behavior is in [decision 0013](../decisions/0013-connected-gmail-mailbox.md); how the token is stored, in [decision 0016](../decisions/0016-mailbox-tokens-and-key-management.md).

Written against the Google Cloud console in October 2026; if a label has moved, look for the same idea.

## Local development

In the project you made for sign-in:

1. **APIs & Services → Library**: search **Gmail API** and press **Enable**.
2. **Google Auth Platform → Data access → Add or remove scopes**: add `https://www.googleapis.com/auth/gmail.readonly`. Google lists it under **restricted** scopes. Keep `openid`, `email`, `profile`.
3. **Audience**: still **Testing**; every person who connects a mailbox must be under **Test users**. That includes the Google account of the mailbox, if it isn't the one you sign in with.
4. **Clients → your web client → Authorized redirect URIs**: add `http://localhost:3000/api/mail/callback` beside the sign-in one.
5. **`.env.local`**:
   ```
   APP_ENV=development
   MAIL_KEY_DEV=…            # openssl rand -base64 32
   WORKER_SECRET=…           # openssl rand -base64 32, a different value
   ```
   `openssl rand -base64 32` prints 32 random bytes (a 256-bit key) as text that fits in `.env.local`; run it once for each and paste the output. `MAIL_KEY_DEV` is the local master key that wraps each mailbox's data key. Keep it out of Git: with it and a copy of the database, the stored tokens can be decrypted. Changing it makes stored tokens unreadable, so connected mailboxes need reconnecting. The app refuses to use it unless `APP_ENV=development`; other environments use Cloud KMS (deploy-render).

Restart `npm run dev` and `npm run worker`. Then Settings → Connected services → Gmail → Connect: pick the history choice, then the Google account. Google shows the "Google hasn't verified this app" screen while testing; **Advanced → Go to … (unsafe)** is expected for test users. Make sure the box for reading your email is ticked.

`WORKER_SECRET` lets the web service ask the worker for sender and subject: Intake's Waiting and Filtered out read them live from Gmail, and only the worker can decrypt the token. The worker listens on `127.0.0.1:3001` (`WORKER_HTTP_PORT` to change it, and `WORKER_URL` to match).

**Sync now** (Intake, top right) is also done by the worker: the first one reads the last 30 days, if that was the choice when connecting, or starts from now; later ones read what arrived since. Only headers and labels are read, never the body.

What the rules can't decide, a model scores from sender, subject, tab, and Gmail's short preview; "Syncing…" lasts until it's done. It uses `AI_MAILBOX_PROVIDER` and `AI_MAILBOX_MODEL`, or `AI_PROVIDER` when they're unset. For a local model: install [Ollama](https://ollama.com), `ollama pull qwen3:8b`, keep `ollama serve` running, and set `AI_MAILBOX_PROVIDER=ollama` and `AI_MAILBOX_MODEL=qwen3:8b`. A provider marked `AI_PROVIDER_KEEPS_DATA` is refused mailbox content unless `AI_FREE_TIER_OK=1`; those emails stay "Not decided yet".

Disconnect is finished by the worker (it alone can decrypt the token to revoke it at Google), so the row says "Disconnecting…" until `npm run worker` picks the job up.

**Testing mode limits**: up to 100 test users, and their consent, so the refresh token, expires after **7 days**. The Gmail row then shows "Google access expired" and Reconnect.

**Automated checks** never call Google: `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, and `GOOGLE_OAUTH_REVOKE_URL` point the flow at a fake Google, as the Calendar tests do with `GOOGLE_CALENDAR_API_URL`.

## Before anyone else connects

`gmail.readonly` is restricted, so publishing the app takes Google's verification **and** a yearly independent security assessment (CASA). Start once connecting works (build order in [docs/design/gmail-ingestion.md](../design/gmail-ingestion.md)):

- Everything the Calendar verification needs ([google-calendar.md](google-calendar.md), "Before real users"): a verified domain, home page, privacy policy, terms, a reason for the scope, a demo video.
- The privacy policy must state Google's **Limited Use** terms: Gmail data is used only to provide the feature, never to train general models, and never sold.
- The CASA assessment, through one of Google's authorized assessors. It examines how tokens and mail are stored (decision 0016).

While the app stays in Testing, test users can keep connecting, with the 7-day expiry.

## Production

A production OAuth client (ideally its own project) with `https://app.example.com/api/mail/callback`, the Gmail API enabled there, and on the host: `APP_ENV=production`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (it also seals the short-lived connect cookie), `BETTER_AUTH_URL`, and the Cloud KMS settings from deploy-render. No `MAIL_KEY_DEV`. The same `WORKER_SECRET` on the web service and the worker; the worker runs as a private service (not reachable from the internet) with `WORKER_HTTP_HOST=0.0.0.0`, and the web service's `WORKER_URL` is its private address.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Gmail isn't set up in this environment" | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` missing, or `MAIL_KEY_DEV` missing, not 32 bytes, or `APP_ENV` isn't `development` |
| "You can't sign in because this app sent an invalid request" (or `redirect_uri_mismatch`) on Google's page | Step 4: the callback isn't listed exactly as `BETTER_AUTH_URL` + `/api/mail/callback` on the same client as `GOOGLE_CLIENT_ID`. Google may take a few minutes to apply a new URI. To see Google's real reason, decode the `authError` value in the error page's address: it's base64 |
| "Google didn't grant access to read Gmail" | The scope isn't added under Data access, or the box was unticked on Google's screen |
| `access_denied` for a teammate | Their Google account isn't under Test users |
| Stuck on "Disconnecting…" or "Syncing…" | `npm run worker` isn't running |
| "Senders and subjects can't be read from Gmail right now" in Waiting or Filtered out | The worker isn't running, `WORKER_SECRET` differs between `.env.local` and the worker (or is missing), or `WORKER_URL` doesn't point at its port. The worker's log says "listening on" when its endpoint is up |
| A Gmail message shows "this model can't read this file" | A PDF attachment on a local model, which reads text and images only; it's analyzed once a provider that reads PDFs is set for mailbox content |
| Emails stay "Not decided yet" | The relevance model isn't reachable (`ollama serve` not running, or the model not pulled), or it's a free tier without `AI_FREE_TIER_OK=1`. The worker's log has `mail.relevance failed` with the code. Sync now tries them again |
| "Last sync failed" | The worker's log has `mail.sync failed` with Gmail's status and reason. A 403 `accessNotConfigured` is step 1 |
