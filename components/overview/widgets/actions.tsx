"use client";

import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useNotificationText } from "@/components/app/notification-text";
import { ReminderStatus, useNotifications } from "@/components/app/notifications";
import { plusDays } from "@/lib/calendar/planner";
import { todayActions, type TodayAction } from "@/lib/overview/actions";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

/** Needs you: one list, most urgent first. Its empty state is news, so it always shows. */
export function ActionsWidget({ ctx: { data, today, items } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const { list } = useNotifications();
  const actions = todayActions({ reminders: list.filter((n) => !n.snoozedUntil), inbox: data.inbox, items, today });
  const analyzing = data.inbox.filter((m) => m.status === "pending").length;
  return (
    <Widget id="actions" title={t("actionsTitle")} count={actions.length}>
      {analyzing > 0 && (
        <p className="today-analyzing" role="status">
          <Loader2 size={16} aria-hidden="true" />
          {t("analyzing", { count: analyzing })}
        </p>
      )}
      {actions.map((a) => (
        <ActionRow key={a.id} action={a} today={today} />
      ))}
      {!actions.length && !analyzing && <p className="empty">{t("actionsEmpty")}</p>}
    </Widget>
  );
}

/** One thing to act on: a tag for how urgent, what it is, and where it opens. */
function ActionRow({ action: a, today }: { action: TodayAction; today: string }) {
  const t = useTranslations("today");
  const text = useNotificationText();
  const router = useRouter();
  const when = useWhen(today);
  const row =
    a.kind === "reminder"
      ? { tag: <ReminderStatus urgency={a.urgency} />, ...text(a.reminder), href: a.reminder.href }
      : a.kind === "review"
        ? {
            tag: <span className="reminder-status today-tag-review">{t("tagReview")}</span>,
            title: a.message.analysis?.title || t("reviewUntitled"),
            detail: t("reviewDetail"),
            href: `/inbox?message=${a.message.id}`,
          }
        : {
            tag: <span className="reminder-status today-tag-clash">{t("tagClash")}</span>,
            title: `${a.items[0].title} × ${a.items[1].title}`,
            detail: `${when(a.date)} ${a.items[0].start}`,
            href: `/calendar?date=${a.date}`,
          };
  return (
    <button className="today-action" onClick={() => router.push(row.href)}>
      {row.tag}
      <span>
        <strong>{row.title}</strong>
        <small>{row.detail}</small>
      </span>
    </button>
  );
}

/** "Today", "Tomorrow", or the weekday and date. */
function useWhen(today: string) {
  const t = useTranslations("today");
  const format = useFormatter();
  return (d: string) =>
    d === today
      ? t("todayShort")
      : d === plusDays(today, 1)
        ? t("tomorrow")
        : format.dateTime(new Date(`${d}T12:00:00Z`), { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });
}
