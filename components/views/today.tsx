"use client";

// 今日總覽: what needs you (one list, most urgent first) as the main column,
// the schedule beside it (today, then the coming days that have something),
// and money in one line. Events live in the schedule only; empty sections
// don't show. On phones the actions come first.
import { ArrowUpRight, BedDouble, CalendarDays, Loader2, Plane } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { ANALYSIS_POLL_MS } from "@/components/app/paste-dialog";
import { RecordEditor, type Editor } from "@/components/app/record-editor";
import { useNotificationText } from "@/components/app/notification-text";
import { ReminderStatus, useNotifications } from "@/components/app/notifications";
import { conflicts, plusDays, planItems, type PlanItem } from "@/lib/calendar/planner";
import { dateInZone } from "@/lib/domain/dates";
import { todayActions, type TodayAction } from "@/lib/domain/today";
import { paymentTotal } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";

const COMING_DAYS = 6; // after today: the rest of the week

/** The date for the page title, in the talent's zone. */
export function TodayDate() {
  const data = useAppData();
  const format = useFormatter();
  const today = dateInZone(data.talent.timeZone);
  return (
    <span className="page-subtitle">
      {format.dateTime(new Date(`${today}T12:00:00Z`), { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })}
    </span>
  );
}

export function TodayView() {
  const data = useAppData();
  const t = useTranslations("today");
  const tEyebrow = useTranslations("eyebrow");
  const [editor, setEditor] = useState<Editor | null>(null);
  const { list } = useNotifications();
  const today = dateInZone(data.talent.timeZone);
  const items = useMemo(() => planItems(data), [data]);
  const actions = todayActions({ reminders: list.filter((n) => !n.snoozedUntil), inbox: data.inbox, items, today });
  // The schedule is events (ours and the person's Google ones); to-dos and payments are actions.
  const scheduled = items.filter((i) => (i.ref.source === "event" || i.ref.source === "google") && !i.done);
  const onDay = (d: string) => scheduled.filter((i) => i.date === d).sort((a, b) => a.start.localeCompare(b.start));
  // A message imported from the header is analyzed in the background: say so, and look again until it lands.
  const analyzing = data.inbox.filter((m) => m.status === "pending").length;
  const router = useRouter();
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => router.refresh(), ANALYSIS_POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, router]);
  const coming = Array.from({ length: COMING_DAYS }, (_, i) => plusDays(today, i + 1)).filter((d) => onDay(d).length);

  return (
    <>
      {!data.projects.length && !data.contacts.length && (
        <section className="surface welcome-card">
          <span>{tEyebrow("welcome")}</span>
          <h2>{t("welcomeTitle")}</h2>
          <p>{t("welcomeBody")}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              {t("createFirstProject")}
            </button>
            <Link className="secondary" href="/inbox?upload=1">
              {t("uploadOffer")}
            </Link>
          </div>
        </section>
      )}
      <div className="today-layout">
        <section className="today-actions" aria-labelledby="today-actions-title">
          <header className="today-section-title">
            <h2 id="today-actions-title">{t("actionsTitle")}</h2>
            {actions.length > 0 && <span className="today-count">{actions.length}</span>}
          </header>
          <div className="surface today-action-list">
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
          </div>
          <MoneyLine today={today} />
        </section>

        <aside className="today-schedule" aria-labelledby="today-schedule-title">
          <header className="today-section-title">
            <h2 id="today-schedule-title">{t("todaySchedule")}</h2>
            <Link className="secondary today-calendar-link" href={`/calendar?date=${today}`}>
              <CalendarDays size={16} aria-hidden="true" />
              {t("openCalendar")}
            </Link>
          </header>
          <div className="surface today-agenda">
            {onDay(today).map((i) => (
              <ScheduleRow key={i.id} item={i} items={items} />
            ))}
            {!onDay(today).length && <p className="empty">{t("todayEmpty")}</p>}
            {coming.map((d) => (
              <div key={d} className="today-day">
                <DayLabel date={d} />
                {onDay(d).map((i) => (
                  <ScheduleRow key={i.id} item={i} items={items} />
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
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

/** One event on one line: time, title, project; travel and Google marked; clashes flagged. */
function ScheduleRow({ item: i, items }: { item: PlanItem; items: PlanItem[] }) {
  const t = useTranslations("today");
  const router = useRouter();
  const clash = conflicts(i, items).length > 0;
  const Icon = i.kind === "travel" ? Plane : i.kind === "accommodation" ? BedDouble : null;
  const open = () =>
    i.ref.source === "google" ? void (i.ref.link && window.open(i.ref.link, "_blank", "noopener")) : router.push(`/calendar?date=${i.date}`);
  return (
    <button className="today-event" onClick={open}>
      <span className="today-event-time">
        {i.start || t("allDay")}
        {i.end && <small>{i.endDate && i.endDate !== i.date ? `→${i.end}` : i.end}</small>}
      </span>
      <span className="today-event-title">
        <strong>
          {Icon && <Icon size={14} aria-hidden="true" />}
          {i.external && <span className="calendar-dot" style={i.external.color ? { background: i.external.color } : undefined} aria-hidden="true" />}
          {i.title}
        </strong>
        {(i.project || i.external) && <small>{i.external ? t("fromGoogle", { calendar: i.external.calendar }) : i.project}</small>}
      </span>
      {clash && <span className="today-event-clash">{t("tagClash")}</span>}
    </button>
  );
}

function DayLabel({ date }: { date: string }) {
  const format = useFormatter();
  return <h3>{format.dateTime(new Date(`${date}T12:00:00Z`), { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" })}</h3>;
}

/** 「今天」, 「明天」, or the weekday and date. */
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

/** Money in one line: what's overdue, due this week, and outstanding in total; zeros left out. */
function MoneyLine({ today }: { today: string }) {
  const data = useAppData();
  const t = useTranslations("today");
  const money = useMoney();
  const open = data.payments.filter((p) => !p.voided && p.status === "expected");
  if (!open.length) return null;
  const weekEnd = plusDays(today, COMING_DAYS);
  const total = (rows: typeof open) => rows.reduce((n, p) => n + paymentTotal(p), 0);
  const incoming = open.filter((p) => p.direction === "in");
  const parts = [
    ["moneyOverdue", total(incoming.filter((p) => p.dueDate && p.dueDate < today))],
    ["moneyThisWeek", total(incoming.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= weekEnd))],
    ["moneyExpected", total(incoming)],
    ["moneyPayable", total(open.filter((p) => p.direction === "out"))],
  ] as const;
  return (
    <p className="today-money">
      <span>{t("money")}</span>
      {parts
        .filter(([, amount]) => amount > 0)
        .map(([key, amount]) => (
          <span key={key} className={key === "moneyOverdue" ? "is-overdue" : undefined}>
            {t(key, { amount: money(amount) })}
          </span>
        ))}
      <Link className="text-button" href="/finance">
        {t("viewFinance")} <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </p>
  );
}
