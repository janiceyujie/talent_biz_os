import "server-only";

// A small Gmail API v1 client: metadata reads, and for email brought in, the
// full message and its attachments, and the push watch (decision 0013). Plain
// fetch, no SDK, like lib/calendar/google/api.ts. GMAIL_API_URL points it at a
// fake Gmail in tests; production leaves it unset.

import { metadataHeaders } from "../metadata";
import type { GmailFullMessage } from "./parts";

const base = () => (process.env.GMAIL_API_URL || "https://gmail.googleapis.com/gmail/v1").replace(/\/$/, "");

/** A failed call: `status` is the HTTP status (0 = no response). Never carries mail content. */
export class GmailError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string, // Google's error reason, e.g. "rateLimitExceeded"
  ) {
    super(`Gmail ${status} ${reason}`);
  }
}

// Gmail allows each mailbox 250 quota units a second; a metadata read costs 5.
// One call every 50 ms per mailbox (20 a second, 100 units) leaves room for
// the sync and Intake's live lookups to run at once.
const SPACING_MS = 50;
const nextSlot = new Map<string, number>(); // by access token, which is per mailbox
const RETRIES = 5; // after "slow down": waits of 1, 2, 4, 8, 16 seconds, or what Gmail asks for
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pace(token: string) {
  const now = Date.now();
  if (nextSlot.size > 1000) nextSlot.clear(); // old access tokens
  const at = Math.max(now, nextSlot.get(token) ?? 0);
  nextSlot.set(token, at + SPACING_MS);
  if (at > now) await sleep(at - now);
}

const rateLimited = (status: number, reason: string) => status === 429 || (status === 403 && /rateLimitExceeded/i.test(reason));

// The Gmail add-on reads with the person's token plus one for the open message
// (X-Goog-Gmail-Access-Token), both short-lived (docs/design/gmail-addon.md).
type Extra = Record<string, string>;

async function call<T>(token: string, path: string, body?: unknown, extra: Extra = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await pace(token);
    let res: Response;
    try {
      res = await fetch(`${base()}/users/me${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { ...extra, authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GmailError(0, "network");
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; errors?: { reason?: string }[] };
    } & T;
    if (res.ok) return json;
    const reason = json.error?.errors?.[0]?.reason ?? json.error?.status ?? "unexpected";
    if (rateLimited(res.status, reason) && attempt < RETRIES) {
      const asked = Number(res.headers.get("retry-after"));
      const wait = Math.min(asked > 0 ? asked * 1000 : 1000 * 2 ** attempt, 30_000);
      nextSlot.set(token, Date.now() + wait); // every caller on this mailbox waits too
      await sleep(wait);
      continue;
    }
    throw new GmailError(res.status, reason);
  }
}

export type GmailHeader = { name: string; value: string };
export type GmailMetadata = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string; // ms since the epoch, as a string
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
};

export function gmailApi(token: string, extra: Extra = {}) {
  const get = <T>(path: string) => call<T>(token, path, undefined, extra);
  return {
    /** One thread: its message ids only (`minimal`), some headers (`metadata`), or every message in full. */
    thread: (id: string, format: "minimal" | "metadata" | "full", headers: string[] = []) => {
      const q = new URLSearchParams({ format });
      for (const h of headers) q.append("metadataHeaders", h);
      return get<{ id: string; messages?: GmailFullMessage[] }>(`/threads/${encodeURIComponent(id)}?${q}`);
    },
    profile: () => call<{ emailAddress: string; historyId: string }>(token, "/profile"),
    /** One page of the change list since a history id; 404 when that id is too old to use. */
    history: (startHistoryId: string, pageToken?: string) =>
      call<{
        history?: {
          messagesAdded?: { message: { id: string; threadId: string } }[];
        }[];
        nextPageToken?: string;
        historyId: string;
      }>(token, `/history?${new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "500", ...(pageToken ? { pageToken } : {}) })}`),
    /** One page of a search, newest first. Spam and trash are left out unless asked for. */
    messages: (q: string, pageToken?: string) =>
      call<{
        messages?: { id: string; threadId: string }[];
        nextPageToken?: string;
      }>(token, `/messages?${new URLSearchParams({ q, maxResults: "500", ...(pageToken ? { pageToken } : {}) })}`),
    /** Headers and labels only (and Gmail's short preview, when asked): Gmail never sends the body in this format. */
    metadata: (id: string, { snippet = false } = {}) => {
      const q = new URLSearchParams({ format: "metadata" });
      for (const h of metadataHeaders) q.append("metadataHeaders", h);
      q.append("fields", `id,threadId,labelIds,internalDate,payload/headers${snippet ? ",snippet" : ""}`);
      return call<GmailMetadata>(token, `/messages/${encodeURIComponent(id)}?${q}`);
    },
    /** The whole message, parts and all: only for email brought in. Attachments come separately. */
    full: (id: string) => call<GmailFullMessage>(token, `/messages/${encodeURIComponent(id)}?format=full`),
    /** Push: Gmail posts a notice to this Pub/Sub topic on every change, for up to 7 days. `expiration` is ms since the epoch. */
    watch: (topicName: string) => call<{ historyId: string; expiration: string }>(token, "/watch", { topicName }),
    stop: () => call<unknown>(token, "/stop", {}),
    attachment: (messageId: string, attachmentId: string) =>
      call<{ data: string; size: number }>(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`),
  };
}
