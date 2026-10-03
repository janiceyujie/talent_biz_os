"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { TravelSummary } from "@/components/app/travel-summary";
import { YourTime } from "@/components/app/your-time";
import { calendarPoints, pointKind } from "@/lib/calendar/points";
import { archiveCalendarItem, setTodoDone } from "@/lib/actions/calendar";
import { dateInZone } from "@/lib/domain/dates";
import { useLabels } from "@/lib/i18n/labels";

// Weekday headers from the locale itself, Sunday first (2024-01-07 was a Sunday).
const weekdays = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i))),
  );

// Calendar events and to-dos in one month view. Each item shows in its own
// local date and time zone; cross-zone items aren't converted to one timeline.
export function CalendarView({ initialDay = "" }: { initialDay?: string }) {
  const data = useAppData();
  const t = useTranslations("calendar");
  const labels = useLabels();
  const locale = useLocale();
  const today = dateInZone(data.talent.timeZone);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [month, setMonth] = useState((initialDay || today).slice(0, 7));
  const [day, setDay] = useState(initialDay);
  const [showDone, setShowDone] = useState(false);
  const [archived, setArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));
  // Ticking a to-do shows immediately; the server's answer replaces it.
  const [calendar, markDone] = useOptimistic(data.calendar, (state, change: { id: string; done: boolean }) =>
    state.map((c) => (c.id === change.id ? { ...c, done: change.done } : c)),
  );
  const start = new Date(`${month}-01T12:00:00Z`);
  const pad = start.getUTCDay();
  const count = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  // Each marker sits on its own local date: a stay can start in one month and end in the next.
  const points = calendarPoints(calendar);
  const items = points
    .filter((p) => p.item.archived === archived && (showDone || !p.item.done) && p.date.startsWith(month) && (!day || p.date === day))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.key.localeCompare(b.key));
  const move = (n: number) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
    setDay("");
  };

  return (
    <>
      <div className="toolbar wrap">
        <button className="secondary" aria-label={t("prevMonth")} onClick={() => move(-1)}>
          ←
        </button>
        <strong>{month}</strong>
        <button className="secondary" aria-label={t("nextMonth")} onClick={() => move(1)}>
          →
        </button>
        <button
          className="secondary"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setDay(today);
          }}
        >
          {t("today")}
        </button>
        <button className="secondary" onClick={() => setDay("")}>
          {t("wholeMonth")}
        </button>
        <button className="primary" onClick={() => setEditor({ kind: "calendar", item: day ? { date: day } : undefined })}>
          {t("new")}
        </button>
        <label className="check-line">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t("showDone")}
        </label>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("archivedOnly")}
        </label>
      </div>
      <p className="muted">{t("note")}</p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="surface calendar-grid">
        {weekdays(locale).map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const n = points.filter((p) => !p.item.archived && !p.item.done && p.date === date).length;
          return (
            <button
              className={`${date === day ? "selected" : ""} ${date === today ? "today" : ""}`}
              key={date}
              onClick={() => setDay(date)}
            >
              <strong>{i + 1}</strong>
              {!!n && <span>{t("count", { count: n })}</span>}
            </button>
          );
        })}
      </div>
      <section className="surface padded section-gap">
        <h2>{t("itemsFor", { period: day || month })}</h2>
        {items.map((p) => {
          const c = p.item;
          const marker = pointKind(p);
          return (
            <article className="event-row" key={p.key}>
              {c.source === "todo" ? (
                <input
                  type="checkbox"
                  aria-label={t("complete", { title: c.title })}
                  checked={c.done}
                  disabled={pending || c.archived}
                  onChange={(e) => {
                    const done = e.target.checked;
                    startTransition(async () => {
                      markDone({ id: c.id, done });
                      setError(await setTodoDone(c.id, done));
                    });
                  }}
                />
              ) : (
                <span aria-hidden="true" />
              )}
              <div>
                <button className="text-button left" onClick={() => setEditor({ kind: "calendar", item: calendarRecord(c) })}>
                  <strong>{c.title}</strong>
                </button>
                <small>
                  {p.date} {p.time || t("noTime")} · {p.timeZone} · {labels.calendarKind(c.kind)}
                  {marker && ` · ${t(`point.${marker}`)}`}
                </small>
                <YourTime date={p.date} time={p.time} timeZone={p.timeZone} />
                {c.travel ? (
                  <TravelSummary item={c} />
                ) : (
                  <p>
                    {c.location}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </p>
                )}
                {c.projectId && (
                  <small>{t("project", { title: data.projects.find((x) => x.id === c.projectId)?.title || t("notFound") })}</small>
                )}
                {c.source === "event" && !c.archived && !p.end && (
                  <a className="text-button" href={`/api/calendar/events/${c.id}`} download>
                    {t("downloadIcs")}
                  </a>
                )}
              </div>
              <button className="text-button" disabled={pending} onClick={() => run(() => archiveCalendarItem(c.id, c.source, !c.archived))}>
                {c.archived ? t("restore") : t("archive")}
              </button>
            </article>
          );
        })}
        {!items.length && <p className="empty">{t("empty")}</p>}
      </section>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
