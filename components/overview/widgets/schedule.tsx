"use client";

import { ArrowUpRight, BedDouble, Plane } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { conflicts, plusDays, type PlanItem } from "@/lib/calendar/planner";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

const COMING_DAYS = 6; // after today: the rest of the week

/**
 * Schedule: today's events, then only the coming days that have something. Events
 * only (ours and the person's Google ones): to-dos and payments are actions.
 * An empty today is news, so it always shows.
 */
export function ScheduleWidget({ ctx: { today, items } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const scheduled = items.filter((i) => (i.ref.source === "event" || i.ref.source === "google") && !i.done);
  const onDay = (d: string) => scheduled.filter((i) => i.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const coming = Array.from({ length: COMING_DAYS }, (_, i) => plusDays(today, i + 1)).filter((d) => onDay(d).length);
  return (
    <Widget
      id="schedule"
      title={t("todaySchedule")}
      link={{
        href: `/calendar?date=${today}`,
        label: (
          <>
            {t("openCalendar")} <ArrowUpRight size={14} aria-hidden="true" />
          </>
        ),
      }}
    >
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
    </Widget>
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
    <button data-preview-safe="true" className="today-event" onClick={open}>
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
