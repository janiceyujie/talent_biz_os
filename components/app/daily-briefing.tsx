"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FileText } from "lucide-react";
import { dateInZone } from "@/lib/domain/dates";
import { briefingItems, snoozeReady } from "@/lib/domain/briefing";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { useAppData } from "./app-data";
import { useReminderFeed } from "./reminder-feed";
import { ReminderSnooze } from "./reminder-snooze";
import { useNotificationText } from "./notification-text";
import { Modal } from "./modal";
import { InfoHint } from "./info-hint";

/** The login briefing and expired snoozes share a single dialog, with no send action. */
export function DailyBriefing({ sessionKey, suppress, requestId, onShow, onOpen }: { sessionKey: string; suppress: boolean; requestId: number; onShow: () => void; onOpen: (href: string) => void }) {
  const data = useAppData(), t = useTranslations("briefing"), locale = useLocale();
  const { agenda, state, now, ready, failed, hasMore, reload, loadMore, loadingMore, portfolio, preview, scopeKey, talent } = useReminderFeed();
  const [open, setOpen] = useState(false), [limit, setLimit] = useState(20);
  const [activeVisit, setActiveVisit] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const [permission, setPermission] = useState("");
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const seen = useRef(new Set<string>());
  const handledRequest = useRef(0);
  const [interaction, setInteraction] = useState(0);
  const native = useRef<globalThis.Notification | null>(null);
  const text = useNotificationText();
  const items = briefingItems(agenda, state, now, talent.timeZone);
  const key = `taloox.briefing:v2:${talent.id}:${data.person.email}:${scopeKey}`;
  const visit = `${sessionKey}:${dateInZone(talent.timeZone, 0, now)}`;
  const visitKey = `${key}:${visit}`;
  const minimize = (restoreFocus = true) => {
    savedScroll.current = content.current?.closest("dialog")?.scrollTop ?? 0;
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => launcher.current?.focus({ preventScroll:true }));
  };
  // UI continuity is per tab/login/scope; business and reminder state stay on the server.
  useEffect(() => {
    queueMicrotask(() => {
      try { if (sessionStorage.getItem(key) === visit) setActiveVisit(visitKey); } catch {}
    });
  }, [key, visit, visitKey]);
  useEffect(() => {
    if (!open || suppress) return;
    const frame = requestAnimationFrame(() => {
      const dialog = content.current?.closest("dialog");
      if (dialog) dialog.scrollTop = savedScroll.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, suppress]);
  useEffect(() => {
    queueMicrotask(() => { try { setBrowserEnabled(localStorage.getItem(`${key}:browser`) === "1" && "Notification" in window && Notification.permission === "granted"); } catch {} });
    return () => native.current?.close();
  }, [key]);
  // Reconsider a deferred briefing as soon as editing or another dialog ends.
  useEffect(() => {
    const reconsider = () => setInteraction(value => value + 1);
    document.addEventListener("focusout", reconsider);
    document.addEventListener("close", reconsider, true);
    document.addEventListener("toggle", reconsider, true);
    document.addEventListener("visibilitychange", reconsider);
    return () => {
      document.removeEventListener("focusout", reconsider);
      document.removeEventListener("close", reconsider, true);
      document.removeEventListener("toggle", reconsider, true);
      document.removeEventListener("visibilitychange", reconsider);
    };
  }, []);
  useEffect(() => {
    if (!ready || suppress || open) return;
    const requested = requestId !== handledRequest.current;
    if (!requested && !failed && !items.length) return;
    const first = `${key}:${visit}:welcome`;
    let welcomed = seen.current.has(first);
    try { welcomed ||= sessionStorage.getItem(key) === visit; } catch {}
    const due = items.filter(n => snoozeReady(n.id, state, now)).map(n => `${n.id}:${state[n.id].snoozedUntil}`);
    const expired = due.filter(token => {
      if (seen.current.has(token)) return false;
      try { return sessionStorage.getItem(`${key}:${token}`) !== "1"; } catch { return true; }
    });
    if (!requested && welcomed && !expired.length) return;
    const visible = document.visibilityState === "visible";
    if (!visible) {
      if (!preview && browserEnabled && "Notification" in window && Notification.permission === "granted" && expired.length && !native.current) {
        try {
          const notice = new Notification(t("notificationTitle"), { body: t("notificationBody"), tag: "taloox-reminders" });
          native.current = notice;
          notice.onclick = () => {
            window.focus(); notice.close(); native.current = null;
            for (const token of expired) { seen.current.add(token); try { sessionStorage.setItem(`${key}:${token}`, "1"); } catch {} }
            setActiveVisit(visitKey); setOpen(true);
          };
          // Mark only the system notification; the in-app dialog still appears on return.
        } catch { /* Unsupported browsers keep the in-app reminder available. */ }
      }
      return;
    }
    if (document.querySelector("dialog[open], [popover]:popover-open") || document.activeElement?.matches("input,textarea,[contenteditable=true]")) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== "visible" || document.querySelector("dialog[open], [popover]:popover-open") || document.activeElement?.matches("input,textarea,select,[contenteditable=true]")) return;
      seen.current.add(first);
      try { sessionStorage.setItem(key, visit); } catch {}
      for (const token of expired) { seen.current.add(token); try { sessionStorage.setItem(`${key}:${token}`, "1"); } catch {} }
      native.current?.close(); native.current = null;
      handledRequest.current = requestId;
      setActiveVisit(visitKey); savedScroll.current = 0;
      setLimit(20); onShow(); setOpen(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [ready, preview, suppress, open, visit, key, items, state, now, browserEnabled, t, onShow, requestId, interaction, visitKey, failed]);
  const browserNotifications = async () => {
    if (browserEnabled) { setBrowserEnabled(false); setPermission(t("disabled")); try { localStorage.removeItem(`${key}:browser`); } catch {} return; }
    if (!("Notification" in window)) { setPermission(t("unsupported")); return; }
    const result = await Notification.requestPermission().catch(() => "denied");
    const enabled = result === "granted";
    setBrowserEnabled(enabled); setPermission(t(enabled ? "enabled" : "denied"));
    try { localStorage.setItem(`${key}:browser`, enabled ? "1" : "0"); } catch {}
  };
  if (suppress) return null;
  const count = ready && !failed ? `${items.length}${hasMore ? "+" : ""}` : "…";
  return <>
    {activeVisit === visitKey && <button ref={launcher} type="button" data-preview-safe="true" className="briefing-launcher" hidden={open} aria-haspopup="dialog" aria-expanded={open} aria-label={t("resumeAgenda", { count })} onClick={() => { void reload(); onShow(); setOpen(true); }}>
      <CalendarDays size={19} aria-hidden="true"/><span>{t("title")}</span><span className="briefing-count" aria-hidden="true">{count}</span>
    </button>}
    {open && <Modal title={t("title")} onClose={() => minimize()}>
    <div ref={content} className="daily-briefing" data-preview-safe="true">
      <p className="briefing-scope">{portfolio ? t("portfolioScope") : preview ? t("previewScope") : t("workspaceScope", { name: talent.name })}</p>
      <div className="briefing-heading"><span>{new Intl.DateTimeFormat(locale, { timeZone: talent.timeZone, weekday:"long", month:"long", day:"numeric" }).format(now)}</span><InfoHint label={t("title")} notes={[t("help"), t("browserHelp")]}/></div>
      {failed && <div role="alert">{t("error")} <button className="text-button" onClick={() => void reload()}>{t("retry")}</button></div>}
      {!items.length && <p className="empty">{t("empty")}</p>}
      <ul className="briefing-list">{items.slice(0, limit).map(n => {
        const copy = text(n);
        return <li key={n.id}>
          <div className="briefing-item-title">{n.kind === "invoice" ? <FileText size={19} aria-hidden="true"/> : <CalendarDays size={19} aria-hidden="true"/>}<div><strong>{copy.title}</strong><span>{copy.detail}</span></div></div>
          <div className="briefing-row-actions"><button type="button" className={n.kind === "invoice" ? "primary" : "secondary"} onClick={() => { minimize(false); if (!preview) void markNotificationsRead([n.id]).then(() => reload()).catch(() => {}); onOpen(n.href); }}>{t(n.kind === "invoice" ? "invoiceNow" : "view")}</button>{!preview && <ReminderSnooze n={n}/>}</div>
        </li>;
      })}</ul>
      {items.length > limit && <button className="text-button" onClick={() => setLimit(limit + 20)}>{t("more")}</button>}
      {hasMore && <button className="text-button" disabled={loadingMore} onClick={() => void loadMore().then(() => setLimit(limit + 20))}>{t("moreInvoices")}</button>}
      <footer className="briefing-footer">{!preview && <button className="text-button" onClick={() => void browserNotifications()}>{t(browserEnabled ? "disableBrowser" : "enableBrowser")}</button>}<button type="button" className="secondary" onClick={() => minimize()}>{t("minimize")}</button></footer>
      {permission && <p role="status">{permission}</p>}
    </div>
  </Modal>}
  </>;
}
