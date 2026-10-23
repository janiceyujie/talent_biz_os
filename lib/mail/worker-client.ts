import "server-only";
import type { PeekResult } from "./peek";
import { PEEK_PATH, type PeekRequest } from "./worker-api";

// The web service's side of the worker's private endpoint (worker/http.ts).

// Deployed, Render sets WORKER_URL to the worker's private host:port, without a scheme (render.yaml).
const workerUrl = () => {
  const url = (process.env.WORKER_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
};

/** Sender and subject for a page of a mailbox's emails; `unavailable` when the worker can't be reached. */
export async function peek(request: PeekRequest): Promise<PeekResult | { error: "unavailable" }> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return { error: "unavailable" };
  try {
    const res = await fetch(`${workerUrl()}${PEEK_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) return { error: "unavailable" };
    return (await res.json()) as PeekResult;
  } catch {
    return { error: "unavailable" };
  }
}
