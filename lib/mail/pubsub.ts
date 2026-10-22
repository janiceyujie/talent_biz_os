import "server-only";
import { readServiceAccount, tokenSource } from "@/lib/google/service-account";
import { PUSH_SETTINGS } from "./push-mode";
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
// PUBSUB_API_URL points it at a fake Pub/Sub in tests. Required in production
// (./push-mode.ts): the worker refuses to start without them.

/** Whether push is set up; otherwise mail is polled. */
export const pushConfigured = () => PUSH_SETTINGS.every((name) => !!process.env[name]);

export const pushTopic = () => process.env.PUBSUB_TOPIC ?? "";

const api = () => (process.env.PUBSUB_API_URL || "https://pubsub.googleapis.com/v1").replace(/\/$/, "");

/** A failed Pub/Sub call. Never carries a notice's content. */
export class PubSubError extends Error {
  constructor(readonly status: number) {
    super(`Pub/Sub ${status}`);
  }
}

/** At startup: the key can be read and looks like a service account's. Throws without its content. */
export function checkCredentials() {
  readServiceAccount("GCP_PUBSUB_CREDENTIALS");
}

const auth = tokenSource({
  account: () => readServiceAccount("GCP_PUBSUB_CREDENTIALS"),
  scope: "https://www.googleapis.com/auth/pubsub",
  fail: (status) => new PubSubError(status),
});

async function call<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${api()}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await auth.token()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) auth.reset(); // the next call signs in again
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
