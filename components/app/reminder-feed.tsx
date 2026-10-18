"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { compareNotifications, isUnread, notifications, withState, type Notification, type StatefulNotification } from "@/lib/domain/notifications";
import type { AppData, NotificationState } from "@/lib/types";
import { useAppData, useWorkspaceTalent } from "./app-data";
import { usePortfolio, usePortfolioWorkspace } from "./portfolio-provider";
import { portfolioLink } from "@/lib/manager/selection";
import { portfolioReminderData } from "@/lib/domain/briefing";

type Feed = { items: Notification[]; state: NotificationState; hasMore: boolean; nextCursor: string | null; now: string };
type Value = { talent: AppData["talent"]; portfolio: boolean; preview: boolean; scopeKey: string; list: StatefulNotification[]; agenda: StatefulNotification[]; unread: StatefulNotification[]; state: NotificationState; now: Date; ready: boolean; failed: boolean; hasMore: boolean; reload: () => Promise<void>; loadMore: () => Promise<void>; loadingMore: boolean };
const Context = createContext<Value | null>(null);

/** A single bounded request stream for the whole shell, not one poll per reminder row. */
export function ReminderProvider({ children }: { children: ReactNode }) {
  const data = useAppData();
  const ownTalent = useWorkspaceTalent();
  const workspace = usePortfolioWorkspace();
  const selection = usePortfolio();
  const preview = !!data.preview && !workspace.active;
  const scopeKey = workspace.active ? `artists:${selection?.ids?.slice().sort().join(",") ?? "none"}` : preview ? "preview" : "workspace";
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const reload = useCallback(async () => {
    if (preview) return;
    try {
      const response = await fetch("/api/reminders", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("unavailable");
      const next: Feed = await response.json();
      setFeed(next); setFailed(false); setNow(new Date());
    } catch { setFailed(true); }
  }, [preview]);
  const loadMore = async () => {
    if (!feed?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response=await fetch(`/api/reminders?after=${encodeURIComponent(feed.nextCursor)}`,{cache:"no-store",signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error("unavailable");
      const next:Feed=await response.json();
      setFeed(previous=>({...next,items:[...(previous?.items ?? []),...next.items.filter(n=>!previous?.items.some(p=>p.id===n.id))]}));setFailed(false);
    } catch {setFailed(true);} finally {setLoadingMore(false);}
  };
  useEffect(() => {
    let active = true;
    const tick = () => { if (!active) return; setNow(new Date()); if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) void reload(); };
    tick();
    const timer = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [reload, data.notificationState]);
  const state = { ...data.notificationState, ...feed?.state };
  const at = preview && data.previewDate ? new Date(`${data.previewDate}T04:00:00Z`) : now;
  const source = workspace.active ? portfolioReminderData({...data, talent:ownTalent}, workspace.error || workspace.data?.limited ? undefined : workspace.data) : data;
  const invoiceItems = workspace.active || preview ? [] : feed?.items ?? [];
  const decorate = (items: Notification[]) => workspace.active ? items.map(item => ({ ...item, href: portfolioLink(item.href, workspace.data?.selectedIds ?? []) })) : items;
  const list = withState(decorate([...notifications(source, at), ...invoiceItems].sort(compareNotifications)), state, at);
  const agenda = withState(decorate([...notifications({...source, notificationState:state}, at, true), ...invoiceItems].sort(compareNotifications)), state, at);
  const available = !workspace.hydrating && !workspace.loading && (!!feed || failed || preview);
  return <Context.Provider value={{ talent:source.talent, portfolio: workspace.active, preview, scopeKey, list, agenda, unread: list.filter(isUnread), state, now: at, ready: available, failed: failed || !!workspace.error || !!workspace.data?.limited, hasMore: !workspace.active && !preview && (feed?.hasMore ?? false), reload: async () => { workspace.retry?.(); await reload(); }, loadMore, loadingMore }}>{children}</Context.Provider>;
}
export function useReminderFeed() {
  const value = useContext(Context);
  if (!value) throw new Error("ReminderProvider is required");
  return value;
}
