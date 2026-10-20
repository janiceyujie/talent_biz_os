"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { syncMyGoogleCalendar } from "@/lib/actions/google-calendar";

const MINUTE_MS = 60_000;

/**
 * The Calendar screen's "Google Calendar · synced 1 min ago ⟳": it syncs on its own when the screen
 * opens or comes back into view (at most once a minute, the server says), and ⟳ syncs now. Settings
 * keeps the rest: choosing calendars, Sync now, disconnecting.
 */
export function GoogleSyncStatus() {
  const { googleCalendar } = useAppData();
  const t = useTranslations("planner");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [pending, startTransition] = useTransition();
  const c = googleCalendar.connection;
  const connected = c?.status === "connected";

  useEffect(() => {
    if (!connected) return;
    const sync = () => document.visibilityState === "visible" && startTransition(async () => void (await syncMyGoogleCalendar()));
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [connected]);

  if (!c) return null;
  if (!connected)
    return (
      <Link className="planner-google-status is-warning" href="/settings#google-calendar">
        {t("googleReconnect")}
      </Link>
    );
  const synced = c.lastSyncedAt ? new Date(c.lastSyncedAt) : null;
  // Under a minute reads as just now: this clock ticks every 30 s, so a sync that just landed can be newer.
  const status = pending
    ? t("googleSyncing")
    : c.lastError
      ? t("googleFailed")
      : !synced
        ? t("googleNever")
        : now.getTime() - synced.getTime() < MINUTE_MS
          ? t("googleJustNow")
          : t("googleSynced", { time: format.relativeTime(synced, now) });
  return (
    <span className={`planner-google-status ${c.lastError && !pending ? "is-warning" : ""}`} role="status">
      {status}
      <button
        type="button"
        className="icon-button"
        aria-label={t("googleSyncNow")}
        title={t("googleSyncNow")}
        disabled={pending}
        onClick={() => startTransition(async () => void (await syncMyGoogleCalendar({ force: true })))}
      >
        <RefreshCw size={14} aria-hidden="true" className={pending ? "spinning" : ""} />
      </button>
    </span>
  );
}
