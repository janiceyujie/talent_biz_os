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
    snippet: decodeEntities(raw.snippet ?? ""),
  };
}

// Gmail's snippet arrives HTML-escaped (&#39;, &amp;, …).
const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return named[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
  });
