# Setting up Google Calendar sync

The Google side of 設定 → 連結的服務 → Google 日曆. Do [Google sign-in](google-sign-in.md) first: the calendar connection asks the Google account already linked there for one more permission, in the **same Google Cloud project and OAuth client**. The behavior is in [decision 0009](../decisions/0009-google-calendar-sync.md).

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

Then in the app: 設定 → 連結的服務 → Google 日曆 → 連結. Google asks for the calendar permission (with the "Google hasn't verified this app" screen while testing — **Advanced → Go to … (unsafe)** is expected for test users). A 「Talent Biz OS」 calendar appears in Google Calendar and fills with your events.

**Testing mode limits**, worth knowing before a demo: up to 100 test users; their consent (and so the refresh token) expires after **7 days**, after which the Google 日曆 row in 設定 shows 「Google 的授權已失效」 and 重新連結.

**Automated tests** never call Google: they run against a fake Google Calendar, so no test account or keys are involved. They use a second dev server beside yours, with its own build folder and the stand-in Google sign-in:

```
NEXT_DIST_DIR=.next-test GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= GOOGLE_TEST_STUB=1 \
  BETTER_AUTH_URL=http://localhost:3001 \
  GOOGLE_CALENDAR_API_URL=http://localhost:4010/calendar/v3 GOOGLE_OAUTH_REVOKE_URL=http://localhost:4010/revoke \
  npx next dev -p 3001
```

(Empty values blank out your real keys for that server only; `.env.local` is untouched.)

## Phase 2 (Google → ours): showing your Google calendars

Works locally (it polls; no public address needed). In the same **Data access** screen, add:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — list the person's calendars to choose from
- `https://www.googleapis.com/auth/calendar.events.readonly` — read events on the chosen calendars

Then 設定 → 連結的服務 → Google 日曆 → 管理 → 在這裡顯示 → 選擇日曆: Google asks for the two permissions, and you tick which calendars to show. These are sensitive scopes, asked only when someone turns this on. After deploying, Google's change notifications can replace polling (decision 0009).

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
| 「Google 的授權已失效」 after a week | Testing-mode consent expired (7 days), or access was removed at myaccount.google.com → Security → Third-party connections |
| Events don't appear in Google | The 「Talent Biz OS」 calendar is hidden in Google Calendar's sidebar, or the Google 日曆 row in 設定 shows 上次同步失敗 (管理 has the details) |
