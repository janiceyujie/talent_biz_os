"use client";
import { useEffect, useState } from "react";
import type { InboxMessage } from "@/lib/types";

/** Selection and workspace changes immediately hide stale details and cancel the old request. */
export function useInboxDetail(id: string, scope: string, revision: string, enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const key = `${scope}:${id}:${revision}:${retry}`;
  const [state, setState] = useState<{ key: string; message?: InboxMessage; failed?: boolean }>({ key: "" });
  useEffect(() => {
    if (!enabled || !id) return;
    const abort = new AbortController();
    fetch(`/api/inbox/${encodeURIComponent(id)}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Unavailable"); return await response.json() as InboxMessage; })
      .then(message => { if (!abort.signal.aborted) setState({ key, message }); })
      .catch(() => { if (!abort.signal.aborted) setState({ key, failed: true }); });
    return () => abort.abort();
  }, [id, key, enabled]);
  return { message: state.key === key ? state.message : undefined, failed: state.key === key && state.failed,
    retry: () => setRetry(value => value + 1) };
}
