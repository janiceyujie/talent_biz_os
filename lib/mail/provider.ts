import type { MailMetadata, MailRef } from "./metadata";

// A mailbox, whoever hosts it (docs/design/gmail-ingestion.md, Modules). Gmail
// is the only one: lib/mail/gmail. Reading bodies and attachments, and push
// notices (watch), join this when the branches that use them arrive.

export interface MailProvider {
  /** Where the change list is now: the cursor a first sync starts from. */
  currentCursor(): Promise<string>;
  /** Emails added since `cursor`, oldest first, and the cursor to use next; null when the cursor is too old. */
  listChanges(cursor: string): Promise<{ mail: MailRef[]; cursor: string } | null>;
  /** Emails received after `after`, oldest first (spam and trash left out), at most `limit`. */
  listSince(after: Date, limit: number): Promise<MailRef[]>;
  /** One email's headers and labels; null when it's gone (deleted since). */
  getMetadata(id: string): Promise<MailMetadata | null>;
}
