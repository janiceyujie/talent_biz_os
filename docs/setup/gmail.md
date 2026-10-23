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

Restart `npm run dev` (it runs the worker too). Then Settings → Connected services → Gmail → Connect: pick the history choice, then the Google account. Google shows the "Google hasn't verified this app" screen while testing; **Advanced → Go to … (unsafe)** is expected for test users. Make sure the box for reading your email is ticked.

`WORKER_SECRET` lets the web service ask the worker for sender and subject: Intake's Waiting and Filtered out read them live from Gmail, and only the worker can decrypt the token. The worker listens on `127.0.0.1:3001` (`WORKER_HTTP_PORT` to change it, and `WORKER_URL` to match).

Mail is checked by the worker on its own: the first check starts as soon as you connect and reads the last 30 days, if that was the choice, or starts from now; later ones read what arrived since. Without push (below), the worker checks every 2 minutes. Intake shows when it last checked, with **Check now** to look right away. Only headers and labels are read, never the body.

What the rules can't decide, a model scores from sender, subject, tab, and Gmail's short preview; "Syncing…" lasts until it's done. It uses the primary provider's relevance model (`AI_PRIMARY`; `AI_MODEL_<PROVIDER>_RELEVANCE` overrides it), like every other model call.

Disconnect is finished by the worker (it alone can decrypt the token to revoke it at Google), so the row says "Disconnecting…" until `npm run worker` picks the job up.

### Push (optional locally)

With push, Gmail tells the worker about new mail within seconds, and the 2-minute check becomes a 15-minute safety net. The worker pulls the notices from Pub/Sub, so nothing has to reach your laptop from the internet.

1. **APIs & Services → Library**: enable **Cloud Pub/Sub API**.
2. **Pub/Sub → Topics → Create topic**: for example `gmail-notices`, without a default subscription.
3. On the topic, **Permissions → Add principal**: `gmail-api-push@system.gserviceaccount.com`, role **Pub/Sub Publisher**. This lets Gmail post to the topic, and nothing else.
4. **Pub/Sub → Subscriptions → Create subscription**: for example `gmail-notices-worker`, on that topic, delivery type **Pull**, message retention 1 day, expiration period **Never expire** (by default a pull subscription is deleted after 31 days without activity, which would quietly stop push).
5. **IAM & Admin → Service accounts → Create service account**: for example `talent-worker`, then on the subscription, **Permissions → Add principal**: that account, role **Pub/Sub Subscriber**. On the account, **Keys → Add key → JSON**: a file downloads. Keep it out of Git.
6. **`.env.local`**:
   ```
   PUBSUB_TOPIC=projects/<project id>/topics/gmail-notices
   PUBSUB_SUBSCRIPTION=projects/<project id>/subscriptions/gmail-notices-worker
   GCP_PUBSUB_CREDENTIALS=/path/to/the/key.json   # or the JSON itself
   ```

Restart `npm run worker`. The next check starts the Gmail watch (it lasts 7 days and is renewed a day before it ends); the Gmail row's next check then follows each new email within seconds.

**Testing mode limits**: up to 100 test users, and their consent, so the refresh token, expires after **7 days**. The Gmail row then shows "Google access expired" and Reconnect.

**Automated checks** never call Google: `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, and `GOOGLE_OAUTH_REVOKE_URL` point the flow at a fake Google, as the Calendar tests do with `GOOGLE_CALENDAR_API_URL`.

## Before anyone else connects

`gmail.readonly` is restricted, so publishing the app takes Google's verification **and** a yearly independent security assessment (CASA). Start once connecting works (build order in [docs/design/gmail-ingestion.md](../design/gmail-ingestion.md)):

- Everything the Calendar verification needs ([google-calendar.md](google-calendar.md), "Before real users"): a verified domain, home page, privacy policy, terms, a reason for the scope, a demo video.
- The privacy policy must state Google's **Limited Use** terms: Gmail data is used only to provide the feature, never to train general models, and never sold.
- The CASA assessment, through one of Google's authorized assessors. It examines how tokens and mail are stored (decision 0016).

While the app stays in Testing, test users can keep connecting, with the 7-day expiry.

## Production

Push is required in production: the Pub/Sub settings above on the worker only (the web service doesn't need them). Without them the worker refuses to start, rather than quietly checking every 2 minutes. A production OAuth client (ideally its own project) with `https://app.example.com/api/mail/callback`, the Gmail API enabled there, and on the host: `APP_ENV=production`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (it also seals the short-lived connect cookie), `BETTER_AUTH_URL`, and the Cloud KMS settings from deploy-render. No `MAIL_KEY_DEV`. The same `WORKER_SECRET` on the web service and the worker; the worker runs as a private service (not reachable from the internet) with `WORKER_HTTP_HOST=0.0.0.0`, and the web service's `WORKER_URL` is its private address.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Gmail isn't set up in this environment" | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` missing, or `MAIL_KEY_DEV` missing, not 32 bytes, or `APP_ENV` isn't `development` |
| "You can't sign in because this app sent an invalid request" (or `redirect_uri_mismatch`) on Google's page | Step 4: the callback isn't listed exactly as `BETTER_AUTH_URL` + `/api/mail/callback` on the same client as `GOOGLE_CLIENT_ID`. Google may take a few minutes to apply a new URI. To see Google's real reason, decode the `authError` value in the error page's address: it's base64 |
| "Google didn't grant access to read Gmail" | The scope isn't added under Data access, or the box was unticked on Google's screen |
| `access_denied` for a teammate | Their Google account isn't under Test users |
| Stuck on "Disconnecting…" or "Syncing…" | `npm run worker` isn't running |
| The worker exits at startup with "Gmail push isn't fully set up" | Set the settings it names (Push, above). Required in production; in development, set all three or none |
| New mail takes minutes to appear with push set up | The worker's log says "push pull failed" with a status: 403 is the subscription's Subscriber permission; 404 is the subscription name. The 15-minute check still brings mail in. With "mail.sync watch failed": the topic's Publisher permission for `gmail-api-push@system.gserviceaccount.com` |
| "Senders and subjects can't be read from Gmail right now" in Waiting or Filtered out | The worker isn't running, `WORKER_SECRET` differs between `.env.local` and the worker (or is missing), or `WORKER_URL` doesn't point at its port. The worker's log says `worker.http.listening` when its endpoint is up |
| Emails stay "Not decided yet" | The relevance model isn't reachable (a missing or wrong `ANTHROPIC_API_KEY`, or the provider is down and there's no `AI_BACKUP`). The worker's log has `mail.relevance failed` with the code. Check now, or the next new email, tries them again |
| "Last sync failed" | The worker's log has `mail.sync failed` with Gmail's status and reason. A 403 `accessNotConfigured` is step 1 |
