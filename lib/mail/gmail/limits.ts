// How much of a Gmail response is read (lib/mail/gmail/api.ts): read as it streams, so an
// oversized one stops early and never fills the worker's memory.
import { FETCH_LIMITS } from "../attachments";

/** Lists, history, and headers: far smaller than this. */
export const MAX_RESPONSE = 2_000_000;
/** A whole message's text and markup, which can run to a few MB. Attachments come separately. */
export const MAX_MESSAGE = 10_000_000;
/** An attachment: base64 (4 bytes for every 3) of at most FETCH_LIMITS.fileBytes, with room for its JSON. */
export const MAX_ATTACHMENT = Math.ceil((FETCH_LIMITS.fileBytes * 4) / 3) + 64 * 1024;

/** The body as text, up to `max` bytes; null past that, with the rest left unread. */
export async function readCapped(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get("content-length")) > max) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
