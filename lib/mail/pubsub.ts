import "server-only";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { readNotice, type GmailNotice } from "./push-notice";

// Gmail's push notices, pulled from our Pub/Sub subscription by the worker
// (decision 0013): no public webhook, and notices wait in Pub/Sub while the
// worker is down. Plain fetch, no SDK (decision 0014); the worker signs in as
// a service account. Without the three settings below, mail arrives by
// polling instead (lib/mail/jobs/reconcile.ts).
//
//   PUBSUB_TOPIC            projects/<project>/topics/<topic>: where Gmail posts notices
//   PUBSUB_SUBSCRIPTION     projects/<project>/subscriptions/<subscription>: what the worker pulls
//   GCP_PUBSUB_CREDENTIALS  the service account's JSON key, or a path to it (worker only)
//
// PUBSUB_API_URL points it at a fake Pub/Sub in tests.

/** Whether push is set up; otherwise mail is polled. */
export const pushConfigured = () => !!(process.env.PUBSUB_TOPIC && process.env.PUBSUB_SUBSCRIPTION && process.env.GCP_PUBSUB_CREDENTIALS);

export const pushTopic = () => process.env.PUBSUB_TOPIC ?? "";

const api = () => (process.env.PUBSUB_API_URL || "https://pubsub.googleapis.com/v1").replace(/\/$/, "");

/** A failed Pub/Sub call. Never carries a notice's content. */
export class PubSubError extends Error {
  constructor(readonly status: number) {
    super(`Pub/Sub ${status}`);
  }
}

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function credentials(): ServiceAccount {
  const raw = process.env.GCP_PUBSUB_CREDENTIALS ?? "";
  return JSON.parse(raw.trim().startsWith("{") ? raw : readFileSync(raw, "utf8"));
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

let cached: { token: string; until: number } | null = null;

/** An access token for Pub/Sub: a service account's signed request, exchanged at Google (cached for its hour). */
async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const sa = credentials();
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/pubsub", aud: tokenUri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new PubSubError(res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, until: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

async function call<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${api()}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) cached = null; // the next call signs in again
  if (!res.ok) throw new PubSubError(res.status);
  return (await res.json().catch(() => ({}))) as T;
}

/** Up to 100 waiting notices; Pub/Sub holds the request open briefly when there are none. */
export async function pullNotices(): Promise<{ ackIds: string[]; notices: GmailNotice[] }> {
  const res = await call<{ receivedMessages?: { ackId: string; message: { data?: string } }[] }>(
    `${process.env.PUBSUB_SUBSCRIPTION}:pull`,
    { maxMessages: 100 },
    90_000,
  );
  const received = res.receivedMessages ?? [];
  return { ackIds: received.map((m) => m.ackId), notices: received.map((m) => readNotice(m.message.data)).filter((n): n is GmailNotice => !!n) };
}

/** Tell Pub/Sub these are handled, so they aren't delivered again. */
export async function acknowledge(ackIds: string[]) {
  if (ackIds.length) await call(`${process.env.PUBSUB_SUBSCRIPTION}:acknowledge`, { ackIds });
}
