// An email's dedup key, the same from the connected mailbox and the Gmail add-on: Gmail's id
// within the mailbox's Google account (`sub`), never the connection, which a reconnect replaces
// (docs/design/google-ids.md). Pure, no server-only imports.
export const gmailDedupKey = (mailboxSubject: string, gmailId: string) => `gmail:${mailboxSubject}:${gmailId}`;
