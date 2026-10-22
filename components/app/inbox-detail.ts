"use client";

import { useEffect, useState } from "react";
import type { OpenedMessage } from "@/lib/types";

// The last version seen of each message: shown while a newer one loads, so a
// refresh (an analysis landing, a save) doesn't blank the reader for a moment.
const latest = new Map<string, OpenedMessage>();
const LATEST_MAX = 30;

/**
 * A message in full (app/api/inbox/[id]), fetched when it's opened. When
 * `revision` changes — the app's data after a save or an analysis — it's
 * fetched again.
 */
export function useInboxDetail(id: string, revision: unknown) {
  const [state, setState] = useState<{ id: string; revision: unknown; message: OpenedMessage | null; failed: boolean }>({
    id: "",
    revision: null,
    message: null,
    failed: false,
  });

  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    fetch(`/api/inbox/${id}`, { signal: abort.signal })
      .then((r) => (r.ok ? (r.json() as Promise<OpenedMessage>) : Promise.reject(r.status)))
      .then((message) => {
        latest.delete(id);
        latest.set(id, message);
        if (latest.size > LATEST_MAX) latest.delete(latest.keys().next().value!);
        setState({ id, revision, message, failed: false });
      })
      .catch(() => !abort.signal.aborted && setState({ id, revision, message: null, failed: true }));
    return () => abort.abort();
  }, [id, revision]);

  const current = state.id === id && state.revision === revision;
  if (current && state.message) return { message: state.message, loading: false, failed: false };
  const stale = latest.get(id);
  if (stale && !(current && state.failed)) return { message: stale, loading: !current, failed: false };
  return { message: null, loading: !!id && !(current && state.failed), failed: current && state.failed };
}
