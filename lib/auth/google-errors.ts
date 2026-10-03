// Error codes Better Auth puts on ?error= after a Google sign-in or link that
// didn't finish, mapped to auth.googleError messages. Unknown codes get the
// generic message.
const known = ["account_not_linked", "account_already_linked_to_different_user", "email_not_found"] as const;
export type GoogleErrorKey = (typeof known)[number] | "generic";

export function googleErrorKey(code: unknown): GoogleErrorKey | null {
  if (typeof code !== "string" || !code) return null;
  return (known as readonly string[]).includes(code) ? (code as GoogleErrorKey) : "generic";
}
