"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { RolePortrait } from "@/components/role/role-portrait";
import { markNotificationsRead, snoozeNotification } from "@/lib/actions/notifications";
import {
  isUnread,
  notifications,
  withState,
  type StatefulNotification,
  type Urgency,
} from "@/lib/domain/notifications";
import { useAppData } from "./app-data";
import { useNotificationText } from "./notification-text";
import { YourTime } from "./your-time";

/** The current time, refreshed every 30 s and when the tab comes back, so snoozes run out on screen. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/** This person's notifications, most urgent first, snoozed ones last. */
export function useNotifications() {
  const data = useAppData();
  const currentTime = useNow();
  const now = data.previewDate ? new Date(`${data.previewDate}T04:00:00Z`) : currentTime;
  const list = withState(notifications(data, now), data.notificationState, now);
  return { list, unread: list.filter(isUnread) };
}

export function ReminderStatus({ urgency }: { urgency: Urgency }) {
  const t = useTranslations("shell");
  return <span className={`reminder-status urgency-${urgency}`}>{t(`urgency.${urgency}`)}</span>;
}

/** "Remind me in an hour", or the snooze deadline and a way to end it early. */
export function ReminderControls({ n }: { n: StatefulNotification }) {
  const data = useAppData();
  const t = useTranslations("shell");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const until =
    n.snoozedUntil &&
    new Intl.DateTimeFormat(locale, { timeZone: data.talent.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(n.snoozedUntil),
    );
  return (
    <div className="reminder-controls">
      {until && <span>{t("snoozedUntil", { time: `${until} · ${data.talent.timeZone}` })}</span>}
      <button
        type="button"
        className="secondary"
        disabled={pending || data.preview}
        onClick={() => startTransition(async () => void (await snoozeNotification(n.id, !n.snoozedUntil)))}
      >
        {n.snoozedUntil ? t("unsnooze") : t("snooze")}
      </button>
    </div>
  );
}

/** The notification panel's rows. Opening one marks it read. */
export function NotificationList({ open }: { open: (href: string) => void }) {
  const data = useAppData();
  const { list, unread } = useNotifications();
  const t = useTranslations("shell");
  const text = useNotificationText();
  const [pending, startTransition] = useTransition();
  return (
    <>
      {unread.length > 0 && (
        <button
          className="text-button"
          disabled={pending || data.preview}
          onClick={() => startTransition(async () => void (await markNotificationsRead(unread.map((n) => n.id))))}
        >
          {t("markAllRead")}
        </button>
      )}
      {list.map((n) => {
        const { title, detail } = text(n);
        return (
          <article className={`notification-row ${n.read ? "read" : ""}`} key={n.id}>
            <button
              className="text-button left"
              onClick={() => {
                if (!data.preview && !n.read) void markNotificationsRead([n.id]);
                open(n.href);
              }}
            >
              <ReminderStatus urgency={n.urgency} />
              <strong>{title}</strong>
              <small>{detail}</small>
              {n.kind === "calendar" && <YourTime date={n.date} time={n.time} timeZone={n.timeZone} />}
            </button>
            <ReminderControls n={n} />
          </article>
        );
      })}
      {!list.length && <p className="empty">{t("notificationsEmpty")}</p>}
    </>
  );
}

const DISMISSED_KEY = "talent-reminder-dismissed";

/**
 * A pop-up for the most urgent unread notification, shortly after the app
 * opens, with the role character. Closing it holds it off for this browser
 * session; snoozing holds that one off for an hour everywhere.
 */
export function ReminderToast({ onOpen, suppress }: { onOpen: () => void; suppress: boolean }) {
  const data = useAppData();
  const { unread } = useNotifications();
  const t = useTranslations("shell");
  const text = useNotificationText();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (sessionStorage.getItem(DISMISSED_KEY)) return;
      } catch {}
      setVisible(true);
    }, 1800);
    return () => clearTimeout(timer);
  }, []);
  const n = unread[0];
  if (!visible || !n || suppress || data.preview) return null;
  const close = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  };
  const { title, detail } = text(n);
  return (
    <aside className="reminder-toast" aria-label={t("reminder")}>
      <div className="reminder-portrait">
        <RolePortrait role={data.person.role} appearance={data.person.appearance} animated />
      </div>
      <div>
        <ReminderStatus urgency={n.urgency} />
        <strong>{title}</strong>
        <p>{detail}</p>
        <button
          className="text-button"
          onClick={() => {
            close();
            onOpen();
          }}
        >
          {t("viewNotifications")}
        </button>
        <ReminderControls n={n} />
      </div>
      <button className="reminder-close" aria-label={t("closeReminder")} onClick={close}>
        ×
      </button>
    </aside>
  );
}
