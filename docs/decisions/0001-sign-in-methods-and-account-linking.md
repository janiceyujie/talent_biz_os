# 0001 — Sign-in methods and account linking

**Status:** Accepted (2026-10-03)

## Context

People sign up with email and password today, and we're adding "Continue with Google". The same human must not end up as two `person` rows because they used a different button the second time — their projects, payments, and calendar hang off one person.

The data model already separates the two ideas: a `person` is the human; each way they sign in is an `auth_account` row (`credential` for a password, `google` for Google). A Google sign-in is identified by Google's permanent account id (`sub`), not by email, so it survives the person changing their Gmail address.

The open question is the *first* Google sign-in by someone who already has a password account: when do we treat it as the same person?

Signing in with Google is not the same as reading someone's Gmail. Sign-in asks Google only for name and email (`openid email profile`), which needs no Google security review. Mailbox access asks for Gmail scopes Google classes as restricted (verification and a security assessment), and the mailbox may not be the person's own — a manager connects an artist's booking inbox. See the architecture doc's Ingestion section.

## Decision

1. **One person, several sign-in methods.** Password and Google are login methods on the same `person`; a person may have either or both.

2. **Link automatically by email only when both sides have proven they own it.** On a first Google sign-in whose email matches an existing person, link Google to that person and sign them in — but only if Google reports the email verified *and* our account's email is verified. This is Better Auth's default (`accountLinking.enabled`, `requireLocalEmailVerified`); we keep it and don't add Google to `trustedProviders`, which would skip Google's verified check.

3. **If our side isn't verified, refuse and say why.** Someone could have registered the address with their own password without proving they own it; linking would hand the real owner's Google sign-in to that account (a "pre-account-takeover"). The person is told to verify their email or sign in with their password.

4. **A different email links only from settings, while signed in.** Someone who signed up with a work address and uses a personal Gmail connects Google under 設定 → 登入方式. Being signed in is the proof, so linking a different email is allowed there (`allowDifferentEmails: true` applies only to this explicit link, never to sign-in). A Google sign-in with an email we've never seen creates a new person, as it should.

5. **Never strand a person.** The last sign-in method can't be unlinked (`allowUnlinkingAll` stays false). People who signed up with Google can add a password through the reset flow, since Google already verified their email.

6. **A Google account belongs to one person.** Linking a Google account already attached to someone else is refused.

7. **Sign-in never grants mailbox access.** Gmail reading, when it comes, is its own consent with its own record (the planned mailbox connection), revocable without affecting sign-in.

## Alternatives considered

- **Ask for the password before linking** ("an account exists — enter your password to link Google"). Safer against edge cases, but adds a step for the common honest case, and a person who forgot their password is stuck at the moment they chose Google to avoid it. Verified-email linking already closes the takeover hole. Revisit if we support identity providers that don't verify email reliably.
- **Never link automatically; only from settings.** No surprise merges, but a returning user who clicks Google lands in an empty new workspace and believes their data is gone. Duplicate accounts are costly here because everything hangs off the person.
- **Link by matching email whether or not it's verified.** Simplest, and the classic takeover bug. Rejected.
- **Trust Google outright (`trustedProviders: ["google"]`).** Google does verify Gmail addresses, but for Workspace domains the claim depends on the domain's admin. Keeping Google's own `email_verified` check costs nothing.
- **Use the login's Google authorization for Gmail reading too** (one consent screen). Fewer clicks, but it ties restricted scopes and a security review to everyone's sign-in, and assumes the login account is the mailbox to read — wrong for managers.

## Consequences

- One extra state to explain: "this email has an account that isn't verified yet". It needs clear copy on the sign-in page and in both languages.
- People with two email addresses can still create two persons by accident if they never use settings. Merging persons isn't supported; if that shows up in practice, it needs its own decision (moving memberships and data between persons).
- Behavior depends on Better Auth's account-linking options; an upgrade that changes defaults (`requireLocalEmailVerified` is marked to become unconditional, which matches this decision) must be checked against this record.
- Tests can't drive real Google sign-in; linking is tested against a stubbed provider, and Google itself is checked by hand.

## References

- Better Auth account linking: `node_modules/@better-auth/core/dist/types/init-options.d.mts` (`accountLinking`) and `better-auth/dist/oauth2/link-account.mjs` (v1.7.7).
- OpenID Connect: the `sub` claim is the stable identifier; `email` can change.
