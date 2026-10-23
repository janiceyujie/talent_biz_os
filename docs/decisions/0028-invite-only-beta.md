# 0028 — Invite-only sign-up during the beta: an email allowlist

**Status:** Accepted (2026-10-23)

## Context

Sign-up on production is open: anyone can create an account with an email and password or with Google. The beta is meant for about 80 people we choose.

The forces:

- **Google's 100-user cap.** Until `gmail.readonly` passes Google's verification and the CASA assessment, at most 100 people can connect Gmail (launch checklist, section 4). Each stranger who connects one takes a place that is hard to get back. 80 planned leaves 20.
- Every account can spend the paid AI keys.
- The marketing site is on Webflow and will collect a waitlist with its own form.
- Production's database is reachable from Render only (decision 0025), so nothing on a laptop can write to it.
- Teams may later invite managers into a workspace, and a referral feature may come later. Neither exists yet.

## Decision

- **An allowlist of emails** (`signup_allowlist`). While it's on, an account is created only for an email on it. Existing accounts are never affected.
- **Checked as the account is created**, in Better Auth's `user.create.before` hook (`lib/auth/beta-access.ts`). Email sign-up and a first Google sign-in both create the account there, so one check covers both. A refused email sees "not on the beta list yet", with the waitlist link on the sign-up page.
- **On in production only**: `SIGNUP_ALLOWLIST=1` on production's web service. Staging is behind its password (decision 0027); local development stays open.
- **People reach the list through the marketing site.** A waitlist form on Webflow collects applications; the team picks each batch, adds the emails, and sends the invitations by hand (`docs/setup/beta-access.md`). The app has no waitlist or approval screens.
- **Added through Supabase's SQL editor for now**, with the statements in `docs/setup/beta-access.md`. Emails are stored trimmed and lowercased; a constraint refuses any other form, so a mistyped insert fails instead of never matching.
- **Each row records** a note (which batch, where they came from), who invited them (empty when added by hand), and when the account was created (`used_at`), so "invited but not signed up yet" is one query.

## Alternatives considered

- **Open sign-up.** Least friction, but strangers can take places under Google's cap and spend the AI keys.
- **Invite links** (one-time links, any email). More code: generating, redeeming, expiring, and screens. A referral feature wouldn't reuse it either (below).
- **A waitlist and approval inside the app.** The Webflow form plus the allowlist does the same job with no screens to build.
- **Adding people with a script from a laptop.** Needs production's `DATABASE_URL` on the laptop, which decision 0025 rules out. A script run in Render's shell keeps the secret on Render but is awkward, especially from a phone; the SQL editor is enough until the staff page below.
- **An allowlist in an environment variable.** No table, but 80 emails in one setting, and each change is a restart. No record of who has signed up.

### Implementation notes

The beta list on the Support page (`user/janlin/beta-list`), from "Later" below:

- **Admins only.** Support staff can read the list; adding, inviting, and withdrawing need the `admin` staff role (`requireStaff("admin")`), since each is hard to take back: a stranger can sign up and spend a place under Google's cap, and an email can't be unsent. This is the first thing `admin` may do that `support` may not (decision 0026).
- **Adding and inviting are two steps.** A pasted batch is checked first (new, withdrawn before, on the list, has an account, not an address), then added; nobody is emailed. Invitations are sent from the list, after a preview of each language's email, one by one in the request (a batch is 10 to 20), from the app's email provider with `Reply-To` set to the team (`TEAM_EMAIL`). Each place records the name given with it (for the greeting), its language, who added it, and when and by whom it was last invited. Invitations are signed "The Taloox team"; answers go to support@taloox.com.
- **Withdrawing, not deleting.** A place nobody has used can be withdrawn: `withdrawn_at` and `withdrawn_by` are set, the row stays, and the sign-up check treats it as not listed. A used place can't be (a check constraint): they have an account. Adding a withdrawn address again restores it.
- **Google's cap isn't counted here.** Google counts every account that ever granted Gmail access, and a disconnected mailbox's row is deleted, so any count from the database would be low. The page points to the Google Cloud console instead.

## Later

- ~~**A staff page for the list**~~: built, see the implementation notes above.
- **Waitlist submissions straight into the app.** Today a batch is copied from Webflow's submissions by hand, which is enough at 10 to 20 a batch. When there are enough applicants that copying gets in the way (or when the role and other answers should be kept with each place):
  1. A Webflow form webhook posts each submission to a new public API route, which checks Webflow's signature on it and refuses anything else.
  2. Submissions land in a table of their own (or as waitlisted places), with the form's answers: role, uses Gmail for work, how they heard. Never added to the allowlist by the webhook: picking stays a person's decision, for Google's cap.
  3. The Beta list shows them as a queue to pick from, with filters by role and Gmail; adding a picked one works as now.
  4. The privacy policy already covers the form; check it covers keeping its answers in the app too.
- **Workspace invitations.** When a talent can invite a manager into their workspace, sending the invitation also adds the email to the allowlist (with `invited_by`), so invited people aren't refused.
- **Referrals.** Different from invite links: a referral code is per person, reusable, and its hard parts are attribution and rewards. Referral codes get their own table, and a sign-up records whose code it came with. While sign-up is still invite-only, signing up with a referral code adds the email to the allowlist, and the check here stays as it is; once sign-up is open, the allowlist is off and the code only records who referred whom. `invited_by` already holds who brought whom in, from the first batch on.
- **Open sign-up.** Set `SIGNUP_ALLOWLIST` off when the beta ends. That needs Google's verification and CASA to have passed first, or the 100-user cap still applies. The table and the check stay, unused, until removed in a later change.

## Consequences

- Invited people must sign up with the email that was invited. Signing up with another one, or a Google account for another address, is refused; the message says to use the invited email.
- The refusal tells someone whether an email is on the list. It doesn't reveal whether an account exists: Better Auth answers sign-ups for existing emails the same way either way. The refusal deliberately uses a 400, not a 403: Better Auth turns a 403 on email sign-up into a made-up success, and the person would wait for a confirmation email that never comes.
- Adding people is a manual step in Supabase's SQL editor, with production data one query away; the guide uses inserts and reads only.
- The waitlist's applications live in Webflow, not in our database. The privacy policy covers them (launch checklist, section 7).
