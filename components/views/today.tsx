"use client";

// 今日總覽: today's schedule first, what needs attention beside it, then
// reminders, the next seven days, travel, deliverables, and money due.
// Layout from the prototype's overview (talent-business-os-prototype,
// src/components/planner/overview.tsx), on the talent's real records.
import { ArrowUpRight, CalendarDays, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { useNotificationText } from "@/components/app/notification-text";
import { ReminderStatus, useNotifications } from "@/components/app/notifications";
import { conflicts, plusDays, planItems, type PlanItem } from "@/lib/calendar/planner";
import { dateInZone } from "@/lib/domain/dates";
import { phaseOf } from "@/lib/domain/phases";
import { isSignedOpen, paymentTotal } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import { EventCard } from "./planner";

export function TodayView() {
  const data = useAppData();
  const t = useTranslations("today");
  const tEyebrow = useTranslations("eyebrow");
  const format = useFormatter();
  const money = useMoney();
  const notificationText = useNotificationText();
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const { list } = useNotifications();
  const alerts = list.filter((n) => !n.snoozedUntil);
  const today = dateInZone(data.talent.timeZone);
  const weekEnd = plusDays(today, 6);
  const items = useMemo(() => planItems(data), [data]);
  const todayItems = items.filter((i) => i.date === today && !i.done);
  const nextWeek = items.filter((i) => i.date >= today && i.date <= weekEnd && !i.done);
  const travel = nextWeek.filter((i) => i.kind === "travel" || i.kind === "accommodation");
  const deliveries = items.filter((i) => i.kind === "deliverable" && !i.done && i.date <= weekEnd);
  const clashes = nextWeek.filter((i) => conflicts(i, items).length).length;
  const live = data.projects.filter((p) => !p.archived);
  const waiting = data.inbox.filter((m) => m.status === "analyzed");
  const talking = live.filter((p) => phaseOf(p.stage) === "negotiation");
  const open = data.payments.filter((p) => !p.voided && p.status === "expected");
  const overdue = open.filter((p) => p.dueDate && p.dueDate < today);
  const dueSoon = open.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= weekEnd);
  const sum = (direction: "in" | "out") => open.filter((p) => p.direction === direction).reduce((n, p) => n + paymentTotal(p), 0);
  const toCalendar = (date = today) => router.push(`/calendar?date=${date}`);
  const openItem = (item: PlanItem) => {
    if (item.ref.source === "payment") {
      const p = data.payments.find((x) => x.id === item.ref.id);
      if (p) setEditor({ kind: "payment", item: toRecord(p) });
    } else toCalendar(item.date);
  };
  const weekday = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: "short", timeZone: "UTC" });

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
      <div className="planner planner-overview">
        <div className="overview-date">
          <span>
            {today} · {data.talent.timeZone}
          </span>
          <button className="text-button" onClick={() => toCalendar()}>
            {t("openCalendar")} <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="overview-layout">
          <section className="overview-today" aria-labelledby="today-agenda-title">
            <header className="overview-section-title">
              <h2 id="today-agenda-title">{t("todaySchedule")}</h2>
              <span>{t("itemCount", { count: todayItems.length })}</span>
            </header>
            {todayItems.map((item) => (
              <EventCard key={item.id} item={item} items={items} onOpen={openItem} />
            ))}
            {!todayItems.length && <p className="empty">{t("todayEmpty")}</p>}
          </section>
          <aside className="overview-attention" aria-label={t("attention")}>
            <h2>
              <CircleAlert size={20} aria-hidden="true" />
              {t("attention")}
            </h2>
            <button className="overview-summary-row" onClick={() => router.push("/finance")}>
              <span>
                <strong>{t("overdue")}</strong>
                <small>{t("overdueNote")}</small>
              </span>
              <b>{overdue.length}</b>
            </button>
            <button className="overview-summary-row" onClick={() => router.push("/inbox")}>
              <span>
                <strong>{t("waitingMessages")}</strong>
                <small>{waiting.length ? t("waitingFirst", { title: waiting[0].analysis?.title || "", count: waiting.length }) : t("waitingNone")}</small>
              </span>
              <b>{waiting.length}</b>
            </button>
            <button className="overview-summary-row" onClick={() => router.push("/projects")}>
              <span>
                <strong>{t("talking")}</strong>
                <small>{talking.length ? t("waitingFirst", { title: talking[0].title, count: talking.length }) : t("talkingNone")}</small>
              </span>
              <b>{talking.length}</b>
            </button>
            <button className="overview-summary-row" onClick={() => toCalendar()}>
              <span>
                <strong>{t("clashes")}</strong>
                <small>{t("clashesNote")}</small>
              </span>
              <b>{clashes}</b>
            </button>
            <div className="overview-active">
              <span>{t("active")}</span>
              <strong>{t("projectCount", { count: live.filter(isSignedOpen).length })}</strong>
              <Link className="text-button" href="/projects">
                {t("viewProjects")} <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>

        <section className="surface action-list">
          <div className="section-header">
            <div>
              <span>{tEyebrow("nextActions")}</span>
              <h2>{t("nextActions")}</h2>
            </div>
          </div>
          {alerts.slice(0, 5).map((n, i) => {
            const text = notificationText(n);
            return (
              <button className="action-row" key={n.id} onClick={() => router.push(n.href)}>
                <span className={`priority p-${i + 1}`}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <ReminderStatus urgency={n.urgency} />
                  <strong>{text.title}</strong>
                  <small>{text.detail}</small>
                </div>
              </button>
            );
          })}
          {!alerts.length && <p className="empty">{t("nextActionsEmpty")}</p>}
        </section>

        <section className="overview-week" aria-label={t("nextSevenDays")}>
          <header className="overview-section-title">
            <h2>{t("nextSevenDays")}</h2>
            <button className="text-button" onClick={() => toCalendar()}>
              {t("viewAll")}
            </button>
          </header>
          <div className="overview-week-strip">
            {Array.from({ length: 7 }, (_, i) => plusDays(today, i)).map((day) => {
              const onDay = items.filter((e) => e.date === day && !e.done);
              return (
                <button className={day === today ? "is-today" : ""} key={day} onClick={() => toCalendar(day)}>
                  <span>{day === today ? t("todayShort") : weekday(day)}</span>
                  <strong>{day.slice(5)}</strong>
                  <span>{onDay.length ? t("itemCount", { count: onDay.length }) : t("nothing")}</span>
                  <small>{onDay[0]?.title || "—"}</small>
                </button>
              );
            })}
          </div>
        </section>

        <div className="overview-bottom">
          <section>
            <h2>
              <CalendarDays size={20} aria-hidden="true" />
              {t("travel")}
            </h2>
            {travel.slice(0, 3).map((e) => (
              <button className="overview-list-row" key={e.id} onClick={() => toCalendar(e.date)}>
                <strong>{e.title}</strong>
                <span>
                  {e.note || e.date}
                  {e.project ? ` · ${e.project}` : ""}
                </span>
              </button>
            ))}
            {!travel.length && <p className="muted">{t("travelNone")}</p>}
          </section>
          <section>
            <h2>{t("deliveries")}</h2>
            {deliveries.slice(0, 3).map((e) => (
              <button className="overview-list-row" key={e.id} onClick={() => toCalendar(e.date)}>
                <strong>{e.title}</strong>
                <span>
                  {e.date < today ? `${t("late")} · ` : ""}
                  {e.date}
                  {e.client ? ` · ${e.client}` : ""}
                </span>
              </button>
            ))}
            {!deliveries.length && <p className="muted">{t("deliveriesNone")}</p>}
          </section>
          <section>
            <h2>{t("money")}</h2>
            <p className="planner-caption">{t("moneyNote")}</p>
            <div className="overview-money">
              {sum("in") > 0 && (
                <p>
                  <span>{t("receivable")}</span>
                  <strong>{money(sum("in"))}</strong>
                </p>
              )}
              {sum("out") > 0 && (
                <p>
                  <span>{t("payable")}</span>
                  <strong>{money(sum("out"))}</strong>
                </p>
              )}
            </div>
            {!open.length && <p className="muted">{t("moneyNone")}</p>}
            {dueSoon.slice(0, 2).map((p) => (
              <button key={p.id} className="overview-list-row" onClick={() => setEditor({ kind: "payment", item: toRecord(p) })}>
                <strong>{p.label}</strong>
                <span>
                  {p.dueDate} · {money(paymentTotal(p))}
                </span>
              </button>
            ))}
            <Link className="text-button" href="/finance">
              {t("viewFinance")} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
