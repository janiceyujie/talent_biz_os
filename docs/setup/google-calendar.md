# Setting up Google Calendar sync

The Google side of 連結 Google 日曆. Do [Google sign-in](google-sign-in.md) first: the calendar connection asks the Google account already linked there for one more permission, in the **same Google Cloud project and OAuth client**. The behavior is in [decision 0009](../decisions/0009-google-calendar-sync.md).

Written against the Google Cloud console in October 2026; if a label has moved, look for the same idea.

## Local development (phase 1: ours → Google)

In the project you made for sign-in:

1. **APIs & Services → Library**: search **Google Calendar API** and press **Enable**. Without this, every calendar call fails with "API not enabled".
2. **Google Auth Platform → Data access → Add or remove scopes**: add
   `https://www.googleapis.com/auth/calendar.app.created`
   ("Make secondary Google calendars, and see, create, change, and delete events on them"). Keep `openid`, `email`, `profile`. Google shows which section the scope lands in (non-sensitive or sensitive); note it — it decides the review later.
3. **Audience**: still **Testing**; make sure every person testing the calendar is under **Test users**.
4. **Clients**: nothing changes — the same web client and redirect URI as sign-in.
5. **`.env.local`**: nothing new for Google. Set a strong `BETTER_AUTH_SECRET` if you haven't: it encrypts the stored Google tokens, so changing it later means people reconnect.

Then in the app: 設定 → 連結 Google 日曆. Google asks for the calendar permission (with the "Google hasn't verified this app" screen while testing — **Advanced → Go to … (unsafe)** is expected for test users). A 「Talent Biz OS」 calendar appears in Google Calendar and fills with your events.

**Testing mode limits**, worth knowing before a demo: up to 100 test users; their consent (and so the refresh token) expires after **7 days**, after which the card shows "needs reconnecting".

**Automated tests** never call Google: they run against a fake Google Calendar, so no test account or keys are involved.

## Phase 2 (Google → ours), later

Needs the app deployed at a public `https` address (Google's change notifications can't reach localhost) and the job queue. Then add, in the same Data access screen:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — list the person's calendars to choose from
- `https://www.googleapis.com/auth/calendar.events.readonly` — read events on the chosen calendars

These are sensitive scopes; they're requested only when someone turns import on.

## Before real users: verification

While the app is in Testing, only test users can connect. To open it up (**Audience → Publish app**), Google verifies the app for its sensitive scopes:

- A **domain you own**, verified in Google Search Console and listed under **Branding → Authorized domains**.
- **Home page, privacy policy, and terms** on that domain. The privacy policy must say what calendar data is read, stored, and shared, and how to remove it (decision 0009, "Storage and security").
- A **reason for each scope** — e.g. "creates a dedicated calendar and keeps the user's bookings from Talent Biz OS in it".
- A **demo video** (unlisted YouTube is fine) showing the consent screen and the feature using the data.
- A **support email** on the consent screen: a Google Group or a Workspace address rather than a personal one.

Calendar scopes are sensitive, not restricted: no paid security assessment. Review usually takes days to a few weeks; replies come by email to the developer contact. To keep sign-in from waiting on it, the production project can publish with the three sign-in scopes first and add the calendar scope once its verification passes.

## Production

As for sign-in: a production OAuth client (ideally its own project) with the production redirect URI, the Calendar API enabled there too, and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` set on the host.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Google Calendar API has not been used in project … or it is disabled" | Step 1: enable the API in this project |
| Google never asks for calendar access | The scope isn't added under Data access, or this Google account isn't the one linked in 設定 |
| `access_denied` for a teammate | They aren't under Test users while the app is in Testing |
| Card shows "needs reconnecting" after a week | Testing-mode consent expired (7 days), or access was removed at myaccount.google.com → Security → Third-party connections |
| Events don't appear in Google | The 「Talent Biz OS」 calendar is hidden in Google Calendar's sidebar, or the 設定 card shows a sync error |
