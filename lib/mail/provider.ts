import type { ReadMessage } from "./gmail/parts";
import type { MailMetadata, MailRef } from "./metadata";

// A mailbox, whoever hosts it (docs/design/gmail-ingestion.md, Modules). Gmail
// is the only one: lib/mail/gmail.

export interface MailProvider {
  /** Where the change list is now: the cursor a first sync starts from. */
  currentCursor(): Promise<string>;
  /** Emails added since `cursor`, oldest first, and the cursor to use next; null when the cursor is too old. */
  listChanges(cursor: string): Promise<{ mail: MailRef[]; cursor: string } | null>;
  /** Emails received after `after`, oldest first (spam and trash left out), at most `limit`. */
  listSince(after: Date, limit: number): Promise<MailRef[]>;
  /** One email's headers and labels, and its short preview when `snippet`; null when it's gone (deleted since). */
  getMetadata(id: string, options?: { snippet?: boolean }): Promise<MailMetadata | null>;
  /** One email's text, headers, and attachment list, for bringing it in; null when it's gone. */
  getMessage(id: string): Promise<ReadMessage | null>;
  /** One attachment's bytes. */
  getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array>;
  /** Push: change notices go to this Pub/Sub topic until the returned time; renewed before then. */
  watch(topic: string): Promise<{ expiresAt: Date }>;
  /** Stop the push notices. */
  stopWatch(): Promise<void>;
}
