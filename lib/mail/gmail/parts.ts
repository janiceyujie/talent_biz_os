// A full Gmail message, read from its MIME parts: the text to analyze and the
// attachments, without fetching any attachment yet. Pure, no server-only imports.
import { htmlToText } from "../clean";
import { parseAddress, type Address } from "../metadata";

export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};
export type GmailFullMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: GmailPart };

export type AttachmentRef = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null; // null when the bytes came inline (small parts)
  data: string | null; // base64url, for inline bytes
};

export type ReadMessage = {
  id: string;
  threadId: string;
  receivedAt: Date;
  from: Address;
  subject: string;
  headerMessageId: string;
  inReplyTo: string;
  references: string;
  text: string; // the plain text, or the HTML as text
  attachments: AttachmentRef[]; // real attachments; images shown inside the body are left out
};

const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** A part's bytes as text in its declared charset (Big5 still turns up in Taiwan), UTF-8 when unknown. */
export function partText(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const charset = /charset="?([\w.-]+)"?/i.exec(header(part, "Content-Type"))?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const walk = (part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] => {
  if (!part) return out;
  out.push(part);
  for (const p of part.parts ?? []) walk(p, out);
  return out;
};

const isAttachment = (p: GmailPart) => !!p.filename || /^attachment/i.test(header(p, "Content-Disposition"));
// An image shown inside the body (a logo, a tracking pixel): marked inline and referenced by Content-ID.
const isInlineImage = (p: GmailPart) =>
  (p.mimeType ?? "").startsWith("image/") && !!header(p, "Content-ID") && !/^attachment/i.test(header(p, "Content-Disposition"));

export function readMessage(raw: GmailFullMessage): ReadMessage {
  const parts = walk(raw.payload);
  const body = parts.filter((p) => !isAttachment(p) && p.body?.data);
  const plain = body.find((p) => p.mimeType === "text/plain");
  const html = body.find((p) => p.mimeType === "text/html");
  const text = plain ? partText(plain).trim() : html ? htmlToText(partText(html)) : "";
  return {
    id: raw.id,
    threadId: raw.threadId,
    receivedAt: new Date(Number(raw.internalDate ?? 0)),
    from: parseAddress(header(raw.payload, "From")),
    subject: header(raw.payload, "Subject"),
    headerMessageId: header(raw.payload, "Message-ID"),
    inReplyTo: header(raw.payload, "In-Reply-To"),
    references: header(raw.payload, "References"),
    text,
    attachments: parts
      .filter((p) => isAttachment(p) && !isInlineImage(p) && p.partId)
      .map((p) => ({
        partId: p.partId!,
        filename: p.filename || "attachment",
        mimeType: (p.mimeType ?? "application/octet-stream").toLowerCase(),
        size: p.body?.size ?? 0,
        attachmentId: p.body?.attachmentId ?? null,
        data: p.body?.attachmentId ? null : (p.body?.data ?? null),
      })),
  };
}
