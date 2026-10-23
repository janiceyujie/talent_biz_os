# Beta access: from the waitlist to an account

During the beta, sign-up on production is invite-only: an account is created only for an email on the allowlist ([decision 0028](../decisions/0028-invite-only-beta.md)). This guide is how people get onto it.

```
Marketing site (Webflow)        The team                         The app (production)
────────────────────────        ─────────────────────────        ──────────────────────────
Waitlist form submitted   ───▶  Webflow emails the team
                                Pick this batch
                                Add their emails  ─────────────▶  signup_allowlist
                                Send each an invitation
They sign up with the invited email  ────────────────────────▶  On the list: account created
                                                                 Not on it: "not on the beta list yet"
```

## 1. The waitlist form (Webflow)

The marketing site's form collects applications; the app never sees them until someone is added. Ask for:

| Field | Required | Why |
|---|---|---|
| Email | Yes | The one they must sign up with. Say so on the form: "We'll invite this email." |
| Name | Yes | For the invitation. |
| Role: musician, influencer, model, manager, agency, other | Yes | To pick a balanced batch. |
| Do you use Gmail for work? | Yes | Mail comes in from Gmail only, and Google caps us at 100 Gmail users until verification passes (below). |
| How did you hear about us? | No | |

Set Webflow to email the team on each submission. Submissions stay in Webflow (Site settings → Forms), exportable as CSV.

The privacy policy has to cover this form: what it collects, that it's used to invite people to the beta, and how to be taken off the list (launch checklist, section 7).

The sign-up page links to the form through the web service's `WAITLIST_URL` setting.

## 2. Picking a batch

- **Mind Google's cap.** Until `gmail.readonly` passes Google's verification and the CASA assessment, at most 100 Google accounts can ever grant us Gmail access, and Google doesn't reset the count. Check how many are used in the Google Cloud console (APIs & Services → OAuth consent screen, the user cap). Invite people who will connect Gmail; don't spend places on curiosity.
- **Batches of 10–20** are easier to support than all 80 at once.
- Note where the batch came from, for the `note` column: e.g. `waitlist, 2026-11 batch 1`.

## 3. Adding them

In Supabase, open **production's** project → SQL Editor. Check the project name before running anything: this is production data. The statements below only add and read.

Add a batch (paste the emails as they are: the statement trims and lowercases them; anyone already on the list is skipped):

```sql
insert into signup_allowlist (email, note)
select lower(btrim(e)), 'waitlist, 2026-11 batch 1'
from unnest(array[
  'first@example.com',
  'second@example.com'
]) as e
on conflict (email) do nothing
returning email;
```

The rows it returns are the ones added. An email missing from them was already on the list.

Invited but not signed up yet:

```sql
select email, note, created_at
from signup_allowlist
where used_at is null
order by created_at;
```

Signed up:

```sql
select email, note, used_at
from signup_allowlist
where used_at is not null
order by used_at desc;
```

Is one person on the list?

```sql
select * from signup_allowlist where email = lower(btrim('Someone@Example.com'));
```

To take back an invitation nobody has used yet, ask before deleting anything in production; there's no statement for it here on purpose.

## 4. The invitation

Send it from the team's address once they're on the list, in the language they applied in. Keep it short:

> Subject: You're invited to the Taloox beta
>
> Hi {name},
>
> You're in. Create your account at https://app.{domain}/sign-up
>
> Use this email address, {email}, to sign up, or sign in with the Google account for it. Another address won't be recognized.
>
> Taloox reads your work email to keep track of offers, deals, and payments. When you connect Gmail, Google shows a warning that the app isn't verified yet. That's expected during the beta: choose Advanced, then continue.
>
> Reply to this email with anything that doesn't work.

Send the Traditional Chinese version to people who applied in Chinese, with the same content.

## 5. When someone can't get in

| They say | Check |
|---|---|
| "It says I'm not on the beta list" | They're using another email, or a Google account for another address. Look them up (statement above) and tell them which email was invited. |
| "I never got the confirmation email" | Their account was created: `used_at` is set. Look in spam; then sign-in re-sends the confirmation. |
| They're on the list but `used_at` is empty | They haven't signed up yet. |

## Later

A staff page in the app replaces sections 3 and 4: paste emails, see who has signed up, and send the invitation from the app ([decision 0028](../decisions/0028-invite-only-beta.md), "Later").
