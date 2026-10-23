# Beta access: from the waitlist to an account

During the beta, sign-up on production is invite-only: an account is created only for an email on the allowlist ([decision 0028](../decisions/0028-invite-only-beta.md)). This guide is how people get onto it.

```
Marketing site (Webflow)        The team                          The app: Support page → Beta list
────────────────────────        ──────────────────────────        ─────────────────────────────────
Waitlist form submitted   ───▶  Webflow emails the team
(kept in Webflow)               Pick a batch in Webflow's
                                submissions, copy their rows ───▶  Paste → Check → Add
                                                                   (signup_allowlist; nobody emailed)
                                                                   Tick → preview → Send invitations
                                                                   (each greeted by name)
They sign up with the invited email  ─────────────────────────▶  On the list: account created,
                                                                   their place shows "Signed up"
                                                                   Not on it: "not on the beta list yet"
```

Nothing reaches the app from the form on its own: someone picks each batch and copies it across. That's on purpose, since Google's cap of 100 Gmail users (section 2) makes each place worth choosing.

## 1. The waitlist form (Webflow)

The marketing site's form collects applications; the app never sees them until someone is added. Ask for:

| Field | Required | Why |
|---|---|---|
| Email | Yes | The one they must sign up with. Say so on the form: "We'll invite this email." |
| Name | Yes | For the invitation. |
| Role: musician, influencer, model, manager, agency, other | Yes | To pick a balanced batch. |
| Do you use Gmail for work? | Yes | Mail comes in from Gmail only, and Google caps us at 100 Gmail users until verification passes (below). |
| How did you hear about us? | No | |

Set Webflow to email the team on each submission. Submissions stay in Webflow (Site settings → Forms), exportable as CSV: that's where a batch is copied from (section 3). The app keeps each invited person's email and name, not their role or other answers; when you pick a batch by role, say so in its note (e.g. `waitlist, 2026-11, musicians`).

The privacy policy has to cover this form: what it collects, that it's used to invite people to the beta, and how to be taken off the list (launch checklist, section 7).

The sign-up page links to the form through the web service's `WAITLIST_URL` setting.

## 2. Picking a batch

- **Mind Google's cap.** Until `gmail.readonly` passes Google's verification and the CASA assessment, at most 100 Google accounts can ever grant us Gmail access, and Google doesn't reset the count. Check how many are used in the Google Cloud console (APIs & Services → OAuth consent screen, the user cap). Invite people who will connect Gmail; don't spend places on curiosity.
- **Batches of 10–20** are easier to support than all 80 at once.
- Note where the batch came from, for the `note` column: e.g. `waitlist, 2026-11 batch 1`.

## 3. Adding them and sending invitations

On the Support page's **Beta list** (`/support/beta`, production). Adding, inviting, and withdrawing need the `admin` staff role; `support` staff can only look ([support.md](support.md), "Granting and revoking").

1. **Add people.** Paste the batch: one person a line, their address and, if you have it, their name ("Mei Lin <mei@example.com>", two columns copied from a spreadsheet, or rows copied from Webflow's CSV, where the first field beside the address is taken as the name). The name greets them in the invitation; without one it says only "Hi". A line with several addresses is read as a list, without names. Write where the batch came from in **Note** (e.g. `waitlist, 2026-11 batch 1`) and pick the **Invitation language**: the one they applied in. **Check** shows what adding would do: new, withdrawn before (restored), already on the list, already with an account (both passed over), not an address. Then **Add**. Nobody is emailed yet.
2. **Send invitations.** Tick the people to invite and **Send invitations**. The dialog shows each language's email as it will go out, and warns when someone was invited before. **Send** sends one by one; each is marked with when and by whom. Failures are listed to try again.
3. **Follow along.** Each place shows its status (not invited yet, invited, signed up, withdrawn), its note and language, and who did what when. Filter by status. A place turns to "Signed up" on its own when they create their account; their account itself (Gmail connected, errors) is on the Support page's **Accounts** tab ([support.md](support.md)).

**Withdrawing** a place nobody has used: **Withdraw** on its row. No one can sign up with that address afterwards; the row stays, marked withdrawn, so who was invited when stays on record. A signed-up place can't be withdrawn: they have an account. Adding a withdrawn address again restores it.

The invitation greets them by name, then says: create your account at `https://app.taloox.com/sign-up`, use this address (or its Google account), and expect Google's "app isn't verified" warning when connecting Gmail during the beta, signed "The Taloox team". Its words are `emails.inviteSubject`, `inviteGreeting`, and `inviteBody` in `messages/en.json` and `messages/zh-TW.json`. It's sent through the app's email provider; answers go to `TEAM_EMAIL`, support@taloox.com (`render.yaml`).

### By SQL, when the page can't be used

In Supabase, open **production's** project → SQL Editor. Check the project name before running anything: this is production data.

Add a batch (trims and lowercases; anyone already on the list is skipped; `locale` is the invitation's language, `zh-TW` or `en`):

```sql
insert into signup_allowlist (email, name, note, locale)
select lower(btrim(e)), n, 'waitlist, 2026-11 batch 1', 'zh-TW'
from unnest(
  array['first@example.com', 'second@example.com'],
  array['First Name', 'Second Name']
) as t(e, n)
on conflict (email) do nothing
returning email;
```

Is one person on the list, and where do they stand?

```sql
select email, locale, note, created_at, invitation_sent_at, used_at, withdrawn_at
from signup_allowlist where email = lower(btrim('Someone@Example.com'));
```

Rows added by SQL show "by SQL" on the page. Invitations aren't sent from SQL; send them from the page, or by hand with the text in section 4.

## 4. The invitation by hand

Only when the page can't send it. From the team's address, in the language they applied in:

> Subject: You're invited to the Taloox beta
>
> Hi {name},
>
> You're in. Create your account at https://app.taloox.com/sign-up
>
> Sign up with this email address, {email}, or sign in with the Google account for it. Another address won't be recognized.
>
> Taloox reads your work email to keep track of offers, deals, and payments. When you connect Gmail, Google shows a warning that the app isn't verified yet. That's expected during the beta: choose Advanced, then continue.
>
> Reply to this email with anything that doesn't work.
>
> The Taloox team

The Traditional Chinese version is `emails.inviteBody` in `messages/zh-TW.json`.

## 5. When someone can't get in

| They say | Check |
|---|---|
| "It says I'm not on the beta list" | They're using another email, or a Google account for another address. Look them up (statement above) and tell them which email was invited. |
| "I never got the confirmation email" | Their account was created: `used_at` is set. Look in spam; then sign-in re-sends the confirmation. |
| They're on the list but haven't signed up | The page shows "Invited" (or "Not invited yet": send it). Check the address they're using. |
| "It says I'm not on the beta list", and the page shows them withdrawn | Their place was withdrawn. Add the address again to restore it. |

## Later

Workspace invitations and referrals ([decision 0028](../decisions/0028-invite-only-beta.md), "Later").
