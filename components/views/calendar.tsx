"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archiveCalendarItem, setTodoDone } from "@/lib/actions/calendar";
import { dateInZone } from "@/lib/domain/dates";
import { calendarKindLabels } from "@/lib/labels";

// Calendar events and to-dos in one month view. Each item shows in its own
// local date and time zone; cross-zone items aren't converted to one timeline.
export function CalendarView({ initialDay = "" }: { initialDay?: string }) {
  const data = useAppData();
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
  const items = calendar
    .filter((c) => c.archived === archived && (showDone || !c.done) && c.date.startsWith(month) && (!day || c.date === day))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const move = (n: number) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
    setDay("");
  };

  return (
    <>
      <div className="toolbar wrap">
        <button className="secondary" aria-label="上個月" onClick={() => move(-1)}>
          ←
        </button>
        <strong>{month}</strong>
        <button className="secondary" aria-label="下個月" onClick={() => move(1)}>
          →
        </button>
        <button
          className="secondary"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setDay(today);
          }}
        >
          今天
        </button>
        <button className="secondary" onClick={() => setDay("")}>
          整月
        </button>
        <button className="primary" onClick={() => setEditor({ kind: "calendar", item: day ? { date: day } : undefined })}>
          ＋新增行程／待辦
        </button>
        <label className="check-line">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          包含已完成
        </label>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          已歸檔
        </label>
      </div>
      <p className="muted">日期按各筆行程登錄的當地日期排列，時間旁保留時區。</p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="surface calendar-grid">
        {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const n = calendar.filter((c) => !c.archived && !c.done && c.date === date).length;
          return (
            <button
              className={`${date === day ? "selected" : ""} ${date === today ? "today" : ""}`}
              key={date}
              onClick={() => setDay(date)}
            >
              <strong>{i + 1}</strong>
              {!!n && <span>{n} 件</span>}
            </button>
          );
        })}
      </div>
      <section className="surface padded section-gap">
        <h2>{day || month} 的行程</h2>
        {items.map((c) => (
          <article className="event-row" key={c.id}>
            {c.source === "todo" ? (
              <input
                type="checkbox"
                aria-label={`完成 ${c.title}`}
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
              <button className="text-button left" onClick={() => setEditor({ kind: "calendar", item: toRecord(c) })}>
                <strong>{c.title}</strong>
              </button>
              <small>
                {c.date} {c.time || "未定時間"} · {c.timeZone} · {calendarKindLabels[c.kind]}
              </small>
              <p>
                {c.location}
                {c.notes ? ` · ${c.notes}` : ""}
              </p>
              {c.projectId && <small>合作案：{data.projects.find((p) => p.id === c.projectId)?.title || "未找到"}</small>}
            </div>
            <button className="text-button" disabled={pending} onClick={() => run(() => archiveCalendarItem(c.id, c.source, !c.archived))}>
              {c.archived ? "還原" : "歸檔"}
            </button>
          </article>
        ))}
        {!items.length && <p className="empty">這段日期沒有符合條件的行程。</p>}
      </section>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
