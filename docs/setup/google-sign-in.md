# Setting up Google sign-in

How to create the Google side of "Continue with Google", locally and after deploying. The behavior (how Google links to existing accounts) is in [decision 0001](../decisions/0001-sign-in-methods-and-account-linking.md).

Google's console labels move around; this was written against the **Google Auth Platform** section of the Cloud console (October 2026). If a name below doesn't match, look for the same idea.

## What we ask Google for

Only `openid`, `email`, and `profile` — who the person is. These are non-sensitive scopes: no security assessment, no Google review beyond optional brand verification. Reading Gmail is a different, restricted permission with its own review, and is deliberately not part of sign-in.

## One OAuth client per environment

Make a separate OAuth client for each place the app runs — local, staging, production. Each has its own redirect URI and secret, so a leaked dev secret can't sign people into production. Production is best in its own Google Cloud project, so its branding, audience, and audit logs aren't mixed with test clients.

## Local development

1. **Create a project** at <https://console.cloud.google.com> (e.g. "Talent Biz OS – dev").
2. **Google Auth Platform → Branding.** App name, user support email, developer contact email. Leave the logo empty for now (a logo triggers brand verification).
3. **Audience.** User type **External**. Publishing status stays **Testing**; add yourself (and anyone else testing) under **Test users** — only they can sign in while testing (up to 100).
4. **Data access.** Add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else.
5. **Clients → Create client.** Type **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy the client ID and secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   ```
   Restart `npm run dev`. The "Continue with Google" buttons and "Connect Google" in settings appear once both are set.

**Tests and the stub.** End-to-end tests can't drive real Google; with no keys and `GOOGLE_TEST_STUB=1`, a stand-in Google accepts made-up identities (`lib/auth/config.ts`). Real keys switch the stub off, so the Google test suite needs an environment without them. The stub never runs in production.

## After deploying

Nothing in the code changes; the Google side and the environment do.

1. **A production OAuth client** (ideally in a production project), type Web application:
   - Authorized JavaScript origins: `https://app.example.com`
   - Authorized redirect URIs: `https://app.example.com/api/auth/callback/google`

   Google matches the redirect URI exactly — scheme, host, port, path, no trailing slash, no wildcards — and requires `https` for anything but localhost.
2. **Environment variables on the host** (never committed): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_URL=https://app.example.com`. Better Auth builds the callback URL from `BETTER_AUTH_URL`; if it's wrong, Google rejects the sign-in with `redirect_uri_mismatch`. Leave `GOOGLE_TEST_STUB` unset.
3. **Branding for real users.** Add the app home page, privacy policy, and terms URLs, and your domain under **Authorized domains** (you'll prove you own it through Google Search Console). A privacy policy page on the domain is required to publish.
4. **Publish.** **Audience → Publish app** moves from Testing to In production, so anyone with a Google account can sign in. With only the three basic scopes there's no security assessment. If you add a logo or want the app name shown prominently, Google runs a brand verification first (typically a few business days).
5. **Allow for propagation.** Google says changes to clients and redirect URIs can take from a few minutes to a few hours to apply.

### Preview and staging deployments

Every redirect URI must be listed exactly, so per-branch preview URLs (e.g. `my-app-git-feature-x.vercel.app`) can't each be registered. Pick one:

- **A stable staging domain** (`staging.example.com`) with its own client — simplest.
- **No Google on previews**; use email and password there.
- **Better Auth's OAuth proxy plugin**, which routes preview sign-ins through one registered URL. Worth it only if previews need Google often.

## Later: reading Gmail

When the connected mailbox (architecture doc, "Designed for later: a connected mailbox") is built, it asks for Gmail scopes Google classes as **restricted**. That means app verification and an annual third-party security assessment (CASA) before more than test users can use it, and it should be its own consent, separate from sign-in. Plan weeks for it; it doesn't affect sign-in.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `redirect_uri_mismatch` on Google's page | The redirect URI in the client doesn't exactly match `BETTER_AUTH_URL` + `/api/auth/callback/google` |
| `access_denied` / "app not verified" for a teammate | Publishing status is Testing and they aren't in Test users |
| Back on our sign-in page with "already has an account but isn't verified" | Expected (decision 0001): verify the email first or sign in with the password |
| Buttons don't appear | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` missing on that environment |
