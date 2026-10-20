"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAppData } from "./app-data";

const CHECK_MS = 10_000; // while the tab is visible; and right away when it's shown again

/**
 * Reloads the screen when something it shows changed elsewhere: the worker
 * brought in or analyzed an email, a teammate edited a project, another tab
 * did something. Asks only for a small change mark (lib/data/changes.ts), and
 * reloads the app data only when it moved.
 */
export function LiveRefresh() {
  const { changes, preview } = useAppData();
  const router = useRouter();
  const shown = useRef(changes);

  // Each reload, ours or a mutation's, brings the mark of what's now on screen.
  useEffect(() => {
    shown.current = changes;
  }, [changes]);

  useEffect(() => {
    if (preview || !changes) return;
    let checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const res = await fetch("/api/changes", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        const { mark } = (await res.json()) as { mark: string };
        if (mark === shown.current) return;
        shown.current = mark; // one reload per change, even before it lands
        router.refresh();
      } catch {
        // offline or the server restarting: the next check tries again
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router, preview, changes]);

  return null;
}
