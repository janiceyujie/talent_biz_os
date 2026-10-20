"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { EventProjectPicker, SeriesProjectPicker } from "@/components/app/project-picker";
import { calendarRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { TravelSummary } from "@/components/app/travel-summary";
import { calendarPoints, externalPoints, pointKind, type CalendarPoint, type ExternalPoint } from "@/lib/calendar/points";
import { archiveCalendarItem, setTodoDone } from "@/lib/actions/calendar";
import { dateInZone } from "@/lib/domain/dates";
import { useLabels } from "@/lib/i18n/labels";
import type { CalendarItem } from "@/lib/types";

// Weekday headers from the locale itself, Sunday first (2024-01-07 was a Sunday).
const weekdays = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i))),
  );

// The month at a glance, like Google Calendar's: each day lists its items (all-day ones first,
// then timed ones, then to-dos), a few at most with "+N more". A day opens a panel with
// everything on it and the actions: completing a to-do, archiving, adding to a project. Each
// item sits on its own local date and shows its own local time (decision 0003); Google events
// are read-only, opened in Google. Phones show dots instead of titles.
const VISIBLE_PER_DAY = 3;

type Point = CalendarPoint | ExternalPoint;
const isGoogle = (p: Point): p is ExternalPoint => "event" in p;

/** Order within a day: all-day events first, then by time, then to-dos without a time. */
const rank = (p: Point) => (isGoogle(p) ? (p.time ? 1 : 0) : p.item.source === "todo" ? (p.time ? 1 : 2) : p.time ? 1 : 0);
const byDay = (a: Point, b: Point) => rank(a) - rank(b) || a.time.localeCompare(b.time) || a.key.localeCompare(b.key);

/** What the month shows, one at a time: the four that make sense together. "unfiled": events not in a project (decision 0017). */
export type MonthShow = "open" | "done" | "unfiled" | "archived";

/** The month's ‹ › and Today, for the Calendar screen's header row. */
export function MonthNav({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const data = useAppData();
  const t = useTranslations("calendar");
  const locale = useLocale();
  const first = new Date(`${month}-01T12:00:00Z`);
  const move = (n: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    onMonth(d.toISOString().slice(0, 7));
  };
  return (
    <div className="planner-date-nav">
      <button className="secondary" aria-label={t("prevMonth")} onClick={() => move(-1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <strong className="planner-month-label">{new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(first)}</strong>
      <button className="secondary" aria-label={t("nextMonth")} onClick={() => move(1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button className="secondary" onClick={() => onMonth(dateInZone(data.talent.timeZone).slice(0, 7))}>
        {t("today")}
      </button>
    </div>
  );
}

/** Show: current, with completed to-dos, not in a project, or archived. */
export function MonthShowSelect({ show, onShow }: { show: MonthShow; onShow: (show: MonthShow) => void }) {
  const t = useTranslations("calendar");
  return (
    <select className="planner-view-select" aria-label={t("show")} value={show} onChange={(e) => onShow(e.target.value as MonthShow)}>
      <option value="open">{t("showOpen")}</option>
      <option value="done">{t("showDone")}</option>
      <option value="unfiled">{t("showUnfiled")}</option>
      <option value="archived">{t("archivedOnly")}</option>
    </select>
  );
}

/** The month itself; its ‹ › and Show sit in the Calendar screen's header (planner.tsx). */
export function CalendarView({ month, show, initialDay = "", onOpenWeek }: { month: string; show: MonthShow; initialDay?: string; onOpenWeek?: (date: string) => void }) {
  const data = useAppData();
  const t = useTranslations("calendar");
  const locale = useLocale();
  const today = dateInZone(data.talent.timeZone);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [day, setDay] = useState(initialDay); // the day whose panel is open
  const [filing, setFiling] = useState<CalendarItem | null>(null);
  const [filingSeries, setFilingSeries] = useState<ExternalPoint | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Ticking a to-do shows immediately; the server's answer replaces it.
  const [calendar, markDone] = useOptimistic(data.calendar, (state, change: { id: string; done: boolean }) =>
    state.map((c) => (c.id === change.id ? { ...c, done: change.done } : c)),
  );
  const first = new Date(`${month}-01T12:00:00Z`);
  const plus = (days: number) => new Date(first.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  // Whole weeks, Sunday first: the days before and after the month fill its first and last week.
  const lead = first.getUTCDay();
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, i) => plus(i - lead));
  // Each marker sits on its own local date: a stay can start in one month and end in the next.
  const points = calendarPoints(calendar);
  // The person's Google events (decision 0009, phase 2): read-only, never archived or done.
  const google = externalPoints(data.externalEvents);
  const noProject = (c: CalendarItem) => c.source === "event" && !c.projectId && !c.archived;
  const unfiledSeries = (p: ExternalPoint) => !!p.event.series && !p.event.series.projectId;
  const inMonth = (p: { date: string }) => p.date.startsWith(month);
  const shown: Point[] =
    show === "archived"
      ? points.filter((p) => p.item.archived)
      : show === "unfiled"
        ? [...points.filter((p) => noProject(p.item)), ...google.filter(unfiledSeries)]
        : [...points.filter((p) => !p.item.archived && (show === "done" || !p.item.done)), ...google];
  const on = (date: string) => shown.filter((p) => p.date === date).sort(byDay);
  // A Google event opens in Google; a series in our own calendar opens its day, to add it to a project.
  const open = (p: Point) => {
    if (!isGoogle(p)) return setEditor({ kind: "calendar", item: calendarRecord(p.item) });
    if (p.event.series) return setDay(p.date);
    if (p.event.link) window.open(p.event.link, "_blank", "noopener");
  };
  const toggleDone = (c: CalendarItem, done: boolean) =>
    startTransition(async () => {
      markDone({ id: c.id, done });
      setError(await setTodoDone(c.id, done));
    });

  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="month-grid" role="grid" aria-label={t("monthLabel")}>
        {weekdays(locale).map((d) => (
          <small key={d} className="month-weekday">
            {d}
          </small>
        ))}
        {cells.map((date) => {
          const items = on(date);
          const hidden = items.length - VISIBLE_PER_DAY;
          return (
            <div key={date} role="gridcell" className={`month-day ${inMonth({ date }) ? "" : "is-outside"} ${date === today ? "is-today" : ""}`}>
              <button className="month-day-number" aria-label={t("openDay", { date })} onClick={() => setDay(date)}>
                {Number(date.slice(8))}
              </button>
              <div className="month-items">
                {items.slice(0, hidden > 0 ? VISIBLE_PER_DAY - 1 : VISIBLE_PER_DAY).map((p) => (
                  <Chip key={p.key} point={p} noProject={!isGoogle(p) ? noProject(p.item) : unfiledSeries(p)} onOpen={() => open(p)} />
                ))}
                {hidden > 0 && (
                  <button className="month-more" onClick={() => setDay(date)}>
                    {t("more", { count: hidden + 1 })}
                  </button>
                )}
              </div>
              {/* Phones: a dot per item, in its colour; the day opens the panel. */}
              <button className="month-dots" aria-label={t("openDay", { date })} onClick={() => setDay(date)}>
                {items.slice(0, 6).map((p) => (
                  <i key={p.key} className={isGoogle(p) ? "is-google" : p.item.source === "todo" ? "is-todo" : "is-event"} />
                ))}
              </button>
            </div>
          );
        })}
      </div>
      {day && (
        <DayPanel
          date={day}
          items={on(day)}
          pending={pending}
          noProject={noProject}
          unfiledSeries={unfiledSeries}
          onClose={() => setDay("")}
          onOpen={(p) => {
            setDay("");
            open(p);
          }}
          onDone={toggleDone}
          onArchive={(c) => startTransition(async () => setError(await archiveCalendarItem(c.id, c.source, !c.archived)))}
          onFile={(c) => setFiling(c)}
          onFileSeries={(p) => setFilingSeries(p)}
          onAdd={() => setEditor({ kind: "calendar", item: { date: day } })}
          onOpenWeek={onOpenWeek && (() => onOpenWeek(day))}
        />
      )}
      {filing && <EventProjectPicker item={filing} onClose={() => setFiling(null)} />}
      {filingSeries?.event.series && (
        <SeriesProjectPicker seriesId={filingSeries.event.series.id} title={filingSeries.event.title} onClose={() => setFilingSeries(null)} />
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}

/** How an item looks: an event, an all-day one, a to-do, a Google event; dashed when not in a project. */
function chipClass(p: Point, noProject: boolean) {
  if (isGoogle(p)) return `month-chip is-google ${p.time ? "" : "is-all-day"} ${noProject ? "is-unfiled" : ""}`;
  const c = p.item;
  if (c.source === "todo") return `month-chip is-todo ${c.done ? "is-done" : ""}`;
  return `month-chip is-event ${p.time ? "" : "is-all-day"} ${noProject ? "is-unfiled" : ""}`;
}

/** One item in a day: its time, and its title (a travel or stay marker says which end it is). */
function Chip({ point: p, noProject, onOpen }: { point: Point; noProject: boolean; onOpen: () => void }) {
  const t = useTranslations("calendar");
  const title = isGoogle(p) ? p.event.title : p.item.title;
  const marker = isGoogle(p) ? null : pointKind(p);
  return (
    <button className={chipClass(p, noProject)} onClick={onOpen} title={title}>
      {p.time && <span className="month-chip-time">{p.time}</span>}
      <span className="month-chip-title">
        {marker ? `${t(`point.${marker}`)} · ` : ""}
        {title}
      </span>
    </button>
  );
}

/** A day's panel: everything on it, with what the list below the month used to offer. */
function DayPanel({
  date,
  items,
  pending,
  noProject,
  unfiledSeries,
  onClose,
  onOpen,
  onDone,
  onArchive,
  onFile,
  onFileSeries,
  onAdd,
  onOpenWeek,
}: {
  date: string;
  items: Point[];
  pending: boolean;
  noProject: (c: CalendarItem) => boolean;
  unfiledSeries: (p: ExternalPoint) => boolean;
  onClose: () => void;
  onOpen: (p: Point) => void;
  onDone: (c: CalendarItem, done: boolean) => void;
  onArchive: (c: CalendarItem) => void;
  onFile: (c: CalendarItem) => void;
  onFileSeries: (p: ExternalPoint) => void;
  onAdd: () => void;
  onOpenWeek?: () => void;
}) {
  const t = useTranslations("calendar");
  const tp = useTranslations("planner");
  const labels = useLabels();
  const data = useAppData();
  const format = useFormatter();
  const projectTitle = (id: string | null) => (id ? data.projects.find((x) => x.id === id)?.title || t("notFound") : "");
  const heading = format.dateTime(new Date(`${date}T12:00:00Z`), { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
  const zone = (p: Point) => (p.timeZone !== data.talent.timeZone ? ` · ${p.timeZone}` : "");
  return (
    <Modal title={heading} onClose={onClose} narrow>
      {!items.length && <p className="muted">{t("emptyDay")}</p>}
      <ul className="day-items">
        {items.map((p) => {
          if (isGoogle(p)) {
            const g = p.event;
            const filedTo = g.series?.projectId ? projectTitle(g.series.projectId) : "";
            return (
              <li key={p.key}>
                <span className="day-item-dot is-google" aria-hidden="true" />
                <button className="text-button left" onClick={() => onOpen(p)}>
                  {p.time && `${p.time} `}
                  {g.title}
                </button>
                <small>
                  {tp("fromGoogle", { calendar: g.calendar })}
                  {zone(p)}
                  {filedTo && ` · ${t("project", { title: filedTo })}`}
                </small>
                <span className="day-item-actions">
                  {g.series && (
                    <button className="text-button" onClick={() => onFileSeries(p)}>
                      {unfiledSeries(p) ? tp("addToProject") : tp("changeProject")}
                    </button>
                  )}
                  {g.link && (
                    <a className="text-button" href={g.link} target="_blank" rel="noopener noreferrer">
                      {tp("openInGoogle")}
                    </a>
                  )}
                </span>
              </li>
            );
          }
          const c = p.item;
          const marker = pointKind(p);
          return (
            <li key={p.key}>
              {c.source === "todo" ? (
                <input type="checkbox" aria-label={t("complete", { title: c.title })} checked={c.done} disabled={pending || c.archived} onChange={(e) => onDone(c, e.target.checked)} />
              ) : (
                <span className="day-item-dot" aria-hidden="true" />
              )}
              <button className="text-button left" onClick={() => onOpen(p)}>
                {p.time && `${p.time} `}
                {marker ? `${t(`point.${marker}`)} · ` : ""}
                {c.title}
              </button>
              <small>
                {labels.calendarKind(c.kind)}
                {zone(p)}
                {c.projectId ? ` · ${projectTitle(c.projectId)}` : ""}
                {noProject(c) ? ` · ${tp("noProject")}` : ""}
              </small>
              {c.travel && <TravelSummary item={c} />}
              <span className="day-item-actions">
                {noProject(c) && (
                  <button className="text-button" onClick={() => onFile(c)}>
                    {tp("addToProject")}
                  </button>
                )}
                {c.source === "event" && !c.archived && !p.end && (
                  <a className="text-button" href={`/api/calendar/events/${c.id}`} download>
                    {t("downloadIcs")}
                  </a>
                )}
                <button className="text-button" disabled={pending} onClick={() => onArchive(c)}>
                  {c.archived ? t("restore") : t("archive")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <footer className="modal-actions">
        {onOpenWeek && (
          <button className="secondary" onClick={onOpenWeek}>
            {t("openInWeek")}
          </button>
        )}
        <button className="primary" onClick={onAdd}>
          {t("addOnDay")}
        </button>
      </footer>
    </Modal>
  );
}
