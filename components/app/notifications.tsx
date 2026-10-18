"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { markNotificationsRead } from "@/lib/actions/notifications";
import {
  type StatefulNotification,
  type Urgency,
} from "@/lib/domain/notifications";
import { useNotificationText } from "./notification-text";
import { YourTime } from "./your-time";

export { useReminderFeed as useNotifications } from "./reminder-feed";
import { useReminderFeed as useNotifications } from "./reminder-feed";
import { ReminderSnooze } from "./reminder-snooze";

export function ReminderStatus({ urgency }: { urgency: Urgency }) {
  const t = useTranslations("shell");
  return <span className={`reminder-status urgency-${urgency}`}>{t(`urgency.${urgency}`)}</span>;
}

export function ReminderControls({ n }: { n: StatefulNotification }) { return <ReminderSnooze n={n}/>; }

/** The notification panel's rows. Opening one marks it read. */
export function NotificationList({ open }: { open: (href: string) => void }) {
  const { list, unread, reload, hasMore, failed, loadMore, loadingMore, preview } = useNotifications();
  const t = useTranslations("shell");
  const text = useNotificationText();
  const [pending, startTransition] = useTransition();
  return (
    <>
      {unread.length > 0 && (
        <button
          className="text-button"
          disabled={pending || preview}
          onClick={() => startTransition(async () => { await markNotificationsRead(unread.slice(0,200).map((n) => n.id)); await reload(); })}
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
                if (!preview && !n.read) void markNotificationsRead([n.id]);
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
      {hasMore && <button className="text-button" disabled={loadingMore} onClick={() => void loadMore()}>{t("moreInvoices")}</button>}
      {failed && <button className="text-button" onClick={() => void reload()}>{t("retryReminders")}</button>}
      {!list.length && <p className="empty">{t("notificationsEmpty")}</p>}
    </>
  );
}
