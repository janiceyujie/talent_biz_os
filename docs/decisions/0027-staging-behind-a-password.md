# 0027 — Staging behind one shared password, checked by the app

**Status:** Accepted (2026-10-23)

## Context

Staging (decision 0025) is a public web service: Render gives it an `onrender.com` address, and later `staging.taloox.com`. Sign-up is open, so anyone who finds the address can create an account, upload files, and spend our paid AI keys, and can see features before they ship.

The forces:

- Only the team uses staging. Beta users (around 80) use production.
- The deploy workflow's smoke check and Render's health check call `/api/health` with no credentials, and calendar apps fetch `/api/calendar/feed/<token>`.
- Staging must be closed whichever address it's reached by. The `onrender.com` address stays live after a custom domain is added.
- One part-time builder: the least setup that's enough.

## Decision

- **One password for staging, as HTTP Basic auth, checked in `proxy.ts`** (`lib/auth/site-password.ts`). The browser asks once and sends it with every request after; any user name is accepted.
- **Set only on staging's web service** (`SITE_PASSWORD`, a secret in Render). Production and local development don't set it and behave as before.
- **Every request goes through the check**, pages, API routes, and static files, so `proxy.ts` has no matcher. Its sign-in redirects still apply to pages only.
- **Paths called by servers go through without it**: `/api/health` and `/api/calendar/feed/<token>`. A new route that a server calls is added to the list in `lib/auth/site-password.ts`, or it fails on staging only.
- The password is compared in constant time and only travels over HTTPS. Changing it is a new value in Render and a restart; everyone types the new one.

## Alternatives considered

- **Public, with `noindex`.** Keeps search engines out, but anyone with the link can sign up and spend the AI keys.
- **A sign-up allowlist.** Stops strangers making accounts, but the sign-in page, the API, and unreleased features stay open to anyone. Production's beta may need one anyway; that's a separate decision.
- **Cloudflare Access** (sign in with a Google account or an emailed code, per person, logged). The stronger option, and where this goes later (below). Not now: see "Why not now".

## Moving to Cloudflare Access

### When

Any one of these:

- More than four or five people need staging: contractors, testers, a designer. A shared password can't tell who used it or be withdrawn from one person.
- Someone with the password leaves, or it leaks, more than once. Each time, everyone has to be given a new one.
- A customer's security questionnaire or an audit (SOC 2) asks who can reach non-production systems and whether access is logged.
- Staging starts holding anything sensitive. It shouldn't (decision 0025: the builder and test accounts only), but if it does, its protection goes up with it.

### What it takes

1. **Move the domain's DNS to Cloudflare** (the free plan). Copy every record across. Keep Webflow's records DNS only (not proxied through Cloudflare), so the marketing site is unaffected.
2. **Create an Access application for `staging.taloox.com`** in Cloudflare Zero Trust (free up to 50 users): a policy allowing the team's emails or the company domain, signing in with Google or a one-time code.
3. **Keep the smoke check working**: a Cloudflare service token whose two headers the deploy workflow sends, or a bypass policy for `/api/health`.
4. **Close the `onrender.com` address.** Cloudflare only guards the address that goes through it. In `lib/auth/site-password.ts`, replace the password check with a check of the token Cloudflare Access adds to every request it lets through (the `Cf-Access-Jwt-Assertion` header: a signed JWT, verified against the team's public keys and the application's audience tag). A request without a valid one is refused, whichever address it came to. The server-path list stays.
5. **Run both for a week**, then remove `SITE_PASSWORD` from Render and the password code.

### Why not now

- **It's more than staging needs.** Two or three people use it; a password stops strangers, which is the risk today.
- **It moves DNS before the domain has settled.** The marketing site on Webflow, the app's custom domains, and email records are all being set up now. Moving the nameservers in the middle adds a step where a mistake takes the marketing site or email down.
- **It doesn't remove the code.** The `onrender.com` address means the app has to check something either way (step 4). The password is the smaller version of the same check, in the same place, so the move replaces one function rather than adding a layer.
- **It's another account, policy, and service token to keep**, for a part-time builder, with nothing gained until one of the "When" triggers happens.

## Consequences

- Staging shows a browser password prompt on the first visit from each browser. Basic auth has no sign-out: closing the browser forgets it.
- The proxy now runs on every request, including static files. It does a header read and a hash on staging, and nothing on production.
- A route that a server calls has to be added to the server-path list, or it works locally and in production and fails on staging. The list's comment says so.
- Sharing the password is all-or-nothing: no record of who used staging.
