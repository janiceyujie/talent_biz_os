// The Google permission for reading a connected mailbox (decision 0013):
// read-only Gmail, plus the account's id and address so we know whose
// mailbox it is. Never a sign-in: this flow is separate from Better Auth.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const MAIL_SCOPES = ["openid", "email", GMAIL_SCOPE];

/** Whether Google's granted scope list (space-separated) includes read-only Gmail; people can untick it. */
export const grantsGmail = (granted: string | undefined) => (granted ?? "").split(" ").includes(GMAIL_SCOPE);
