"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { RolePortrait } from "@/components/role/role-portrait";
import { markNotificationsRead, snoozeNotification } from "@/lib/actions/notifications";
import {
  isUnread,
  notifications,
  SNOOZE_HOURS,
  withState,
  type StatefulNotification,
  type Urgency,
} from "@/lib/domain/notifications";
import { dateInZone, exactInstant } from "@/lib/domain/dates";
import { useAppData } from "./app-data";
import { DateTimeInput } from "./date-time-input";
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

/**
 * "Remind me later": in one, two, or three hours, or at a time picked (in the talent's time zone,
 * up to 30 days ahead). Snoozed, it shows until when, and a way to end it early.
 */
export function ReminderControls({ n }: { n: StatefulNotification }) {
  const data = useAppData();
  const t = useTranslations("shell");
  const locale = useLocale();
  const zone = data.talent.timeZone;
  const today = dateInZone(zone);
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(today);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const snooze = (value: Parameters<typeof snoozeNotification>[1]) =>
    startTransition(async () => {
      const failure = await snoozeNotification(n.id, value);
      setError(failure);
      if (!failure) {
        setChoosing(false);
        setPicking(false);
      }
    });
  // Today it's the time alone; another day, the date too.
  const until =
    n.snoozedUntil &&
    new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      ...(dateInZone(zone, 0, new Date(n.snoozedUntil)) === today ? {} : { month: "short", day: "numeric" }),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(n.snoozedUntil));
  return (
    <div className="reminder-controls">
      {until && <span>{t("snoozedUntil", { time: `${until} · ${zone}` })}</span>}
      <button
        type="button"
        className="secondary"
        disabled={pending || data.preview}
        aria-expanded={n.snoozedUntil ? undefined : choosing}
        onClick={() => (n.snoozedUntil ? snooze(false) : setChoosing(!choosing))}
      >
        {n.snoozedUntil ? t("unsnooze") : t("snooze")}
      </button>
      {choosing && !n.snoozedUntil && (
        <div className="reminder-snooze-options" role="group" aria-label={t("snooze")}>
          {SNOOZE_HOURS.map((hours) => (
            <button key={hours} type="button" className="secondary" disabled={pending} onClick={() => snooze(hours)}>
              {t("snoozeHours", { hours })}
            </button>
          ))}
          <button type="button" className="text-button" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {t("snoozePick")}
          </button>
          {picking && (
            <form
              className="reminder-snooze-pick"
              onSubmit={(e) => {
                e.preventDefault();
                const at = exactInstant(day, time, zone);
                if (at === null) setError(t("snoozePickInvalid"));
                else snooze(new Date(at).toISOString());
              }}
            >
              <DateTimeInput kind="date" required label={t("snoozeDay")} value={day} min={today} today={today} onChange={setDay} />
              <DateTimeInput kind="time" required label={t("snoozeTime", { zone })} value={time} today={day} onChange={setTime} />
              <button type="submit" className="secondary" disabled={pending}>
                {t("snoozeSave")}
              </button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
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
