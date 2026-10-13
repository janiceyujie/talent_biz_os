import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// The worker's private endpoint (worker/http.ts) and the web service's calls to
// it (lib/mail/worker-client.ts): the one place that can decrypt a mailbox's
// token answers a few live questions about it. Reachable only inside our own
// network, and only with WORKER_SECRET.

export const PEEK_PATH = "/mail/peek";

export const peekRequest = z.strictObject({
  connectionId: z.uuid(),
  ids: z.array(z.string().regex(/^[0-9a-f]{1,32}$/i)).max(50), // Gmail message ids are hex
});
export type PeekRequest = z.infer<typeof peekRequest>;

/** `Authorization: Bearer <secret>` against the configured secret, in constant time. */
export function authorized(header: string | undefined, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(secret));
}
