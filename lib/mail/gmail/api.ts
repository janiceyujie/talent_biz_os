import "server-only";

// A small Gmail API v1 client: only the metadata reads (decision 0013). Plain
// fetch, no SDK, like lib/calendar/google/api.ts. GMAIL_API_URL points it at a
// fake Gmail in tests; production leaves it unset.

import { metadataHeaders } from "../metadata";

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

async function call<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await pace(token);
    let res: Response;
    try {
      res = await fetch(`${base()}/users/me${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GmailError(0, "network");
    }
    const reader=res.body?.getReader();
    const chunks:Uint8Array[]=[]; let bytes=0;
    if(reader) try { for(;;){ const part=await reader.read(); if(part.done)break; bytes+=part.value.length; if(bytes>2_000_000)throw new GmailError(0,"response_too_large"); chunks.push(part.value); } } finally {await reader.cancel().catch(()=>{});}
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
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

export function gmailApi(token: string) {
  return {
    full: (id:string) => call<GmailMetadata>(token, `/messages/${encodeURIComponent(id)}?format=full`),
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
  };
}
