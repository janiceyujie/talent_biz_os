import { metadataHeaders, parseAddress, type MailMetadata } from "../metadata";
import type { GmailMetadata } from "./api";

/** Gmail's metadata answer as our own shape: just the headers we asked for. */
export function toMetadata(raw: GmailMetadata): MailMetadata {
  const header = (name: string) => raw.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const headers = Object.fromEntries(metadataHeaders.map((h) => [h, header(h)])) as MailMetadata["headers"];
  return {
    id: raw.id,
    threadId: raw.threadId,
    labels: raw.labelIds ?? [],
    from: parseAddress(headers.From),
    subject: headers.Subject,
    receivedAt: new Date(Number(raw.internalDate ?? 0)),
    headers,
  };
}
