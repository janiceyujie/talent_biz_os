import { APIError } from "better-auth/api";

// While the beta is invite-only, an account is created only for an email on the
// allowlist (decision 0028; adding people: docs/setup/beta-access.md). The check
// runs as the person row is created, so email sign-up and a first Google sign-in
// both pass through it. Existing accounts are never affected.
// SIGNUP_ALLOWLIST=1 turns it on, in production only.

/** The code the sign-up form and Google's ?error= carry when an email isn't on the list. */
export const SIGNUP_NOT_ALLOWED = "SIGNUP_NOT_ALLOWED";

export const allowlistOn = (env: Record<string, string | undefined> = process.env) => env.SIGNUP_ALLOWLIST === "1";

/** How emails are stored on the list: trimmed and lowercased, as Better Auth stores them on `person`. */
export const listEmail = (email: string) => email.trim().toLowerCase();

/** Refuses the new account unless the allowlist is off or the email is on it. */
export async function checkSignupAllowed(email: string, o: { on: boolean; isListed: (email: string) => Promise<boolean> }) {
  if (!o.on) return;
  if (await o.isListed(listEmail(email))) return;
  // Not 403: on email sign-up Better Auth answers a 403 with a made-up success (it hides
  // which emails have accounts), and the person would wait for an email that never comes.
  throw new APIError("BAD_REQUEST", { code: SIGNUP_NOT_ALLOWED, message: "This email isn't on the beta list" });
}
