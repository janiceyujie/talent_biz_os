"use client";

// Day and week calendar over the talent's real events, to-dos, and payment
// dates (lib/calendar/planner.ts), with the month view as the third tab.
// Dragging a timed item moves it in 15-minute steps and saves through the same
// action as the calendar form; fixed items and clashes ask first, and recent
// moves can be undone. Adapted from the prototype's planner
// (talent-business-os-prototype, src/components/planner/calendar.tsx).
import { ChevronLeft, ChevronRight, LockKeyhole, Move, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type PointerEvent } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { calendarRecord, RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { saveCalendarItem } from "@/lib/actions/calendar";
import { clock, conflicts, minutes, moveItem, planItems, plusDays, validItem, weekStart, type PlanItem } from "@/lib/calendar/planner";
import { dateInZone } from "@/lib/domain/dates";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { CalendarView } from "./calendar";

type View = "day" | "week" | "month";

/** `initialDay` opens the month filtered to that day (reminder links); `initialDate` opens that day's schedule. */
export function PlannerView({ initialDay = "", initialDate = "" }: { initialDay?: string; initialDate?: string }) {
  const data = useAppData();
  const t = useTranslations("planner");
  const tCalendar = useTranslations("calendar");
  const format = useFormatter();
  const today = dateInZone(data.talent.timeZone);
  const [view, setView] = useState<View>(initialDay ? "month" : initialDate ? "day" : "week");
  const [date, setDate] = useState(initialDay || initialDate || today);
  // The item being edited; `dropped` when it came from a drag, so the dialog only asks to confirm.
  const [editing, setEditing] = useState<(PlanItem & { dropped?: boolean }) | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<PlanItem[]>([]); // the item as it was before each move
  const [, startTransition] = useTransition();
  const saved = useMemo(() => planItems(data), [data]);
  // A move shows at once; the server's answer replaces it.
  const [items, show] = useOptimistic(saved, (state, moved: PlanItem) => state.map((i) => (i.id === moved.id ? moved : i)));

  /** Save a new date and time through the calendar form's action. */
  const save = (next: PlanItem, before: PlanItem | null) =>
    startTransition(async () => {
      const c = data.calendar.find((x) => x.id === next.ref.id && x.source === next.ref.source);
      if (!c) return;
      show(next);
      const failure = await saveCalendarItem({ ...calendarRecord(c), date: next.date, time: next.start, endTime: next.end });
      if (failure) return setMessage(failure);
      if (before) setHistory((h) => [...h.slice(-19), before]);
      setMessage(before ? t("moved", { title: next.title }) : t("undone", { title: next.title }));
    });
  const undo = () => {
    const before = history.at(-1);
    if (!before) return;
    setHistory((h) => h.slice(0, -1));
    save(before, null);
  };
  const open = (item: PlanItem) => {
    if (item.movable) return setEditing(item);
    // Multi-day, other-zone, and payment items are edited in their full form.
    if (item.ref.source === "payment") {
      const p = data.payments.find((x) => x.id === item.ref.id);
      if (p) setEditor({ kind: "payment", item: toRecord(p) });
    } else {
      const c = data.calendar.find((x) => x.id === item.ref.id);
      if (c) setEditor({ kind: "calendar", item: calendarRecord(c) });
    }
  };

  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => plusDays(weekStart(date), i)) : [date];
  const dayLabel = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: "short", timeZone: "UTC" });

  return (
    <div className="planner">
      <div className="planner-view-tabs" role="group" aria-label={t("views")}>
        {(["day", "week", "month"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
      {view === "month" ? (
        <CalendarView initialDay={initialDay} />
      ) : (
        <>
          <div className="planner-toolbar">
            <div className="planner-date-nav">
              <button className="secondary" aria-label={t(view === "week" ? "prevWeek" : "prevDay")} onClick={() => setDate(plusDays(date, view === "week" ? -7 : -1))}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button className="secondary" onClick={() => setDate(today)}>
                {t("today")}
              </button>
              <button className="secondary" aria-label={t(view === "week" ? "nextWeek" : "nextDay")} onClick={() => setDate(plusDays(date, view === "week" ? 7 : 1))}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <h2>{view === "week" ? t("weekRange", { from: days[0], to: days[6].slice(5) }) : date}</h2>
            <button className="primary" onClick={() => setEditor({ kind: "calendar", item: { date } })}>
              {tCalendar("new")}
            </button>
            <label className="planner-date-picker">
              {t("goTo")}
              <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
            </label>
          </div>
          <div className="planner-legend">
            <span>
              <LockKeyhole size={15} aria-hidden="true" />
              {t("legendFixed")}
            </span>
            <span>
              <Move size={15} aria-hidden="true" />
              {t("legendFlexible")}
            </span>
            <span>{t("zone", { zone: data.talent.timeZone })}</span>
          </div>
          <div className="planner-feedback">
            <span role="status" aria-live="polite">
              {message || t("hint")}
            </span>
            <button className="secondary" disabled={!history.length} onClick={undo}>
              <Undo2 size={16} aria-hidden="true" />
              {t("undo")}
            </button>
          </div>
          <TimeGrid
            days={days}
            today={today}
            view={view}
            items={items}
            dayLabel={dayLabel}
            onOpen={open}
            onDrop={(next, before) => {
              if (!validItem(next)) return setMessage(t("invalidMove"));
              // Fixed commitments and clashes are confirmed in the editor; flexible work just moves.
              if (next.fixed || conflicts(next, items).length) setEditing({ ...next, dropped: true });
              else save(next, before);
            }}
          />
          <div className="planner-mobile-agenda">
            {days.map((day) => (
              <section key={day}>
                <h3>
                  {day.slice(5)} · {dayLabel(day)}
                  {day === today ? ` · ${t("today")}` : ""}
                </h3>
                {items
                  .filter((e) => e.date === day)
                  .map((item) => (
                    <EventCard key={item.id} item={item} items={items} onOpen={open} />
                  ))}
                {!items.some((e) => e.date === day) && <p className="muted">{t("nothing")}</p>}
              </section>
            ))}
          </div>
          {!items.some((e) => days.includes(e.date)) && <p className="notice">{t("emptyRange")}</p>}
          <p className="planner-caption">{t("caption")}</p>
        </>
      )}
      {editing && (
        <TimeEditor
          key={`${editing.id}${editing.date}${editing.start}${editing.end}`}
          item={editing}
          dropped={!!editing.dropped}
          original={saved.find((i) => i.id === editing.id) ?? editing}
          items={items}
          onClose={() => setEditing(null)}
          onSave={(next, before) => {
            setEditing(null);
            save(next, before);
          }}
          onFull={() => {
            const c = data.calendar.find((x) => x.id === editing.ref.id);
            setEditing(null);
            if (c) setEditor({ kind: "calendar", item: calendarRecord(c) });
          }}
        />
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** One row per hour, plus a row for dated items without a time. Dragging works with a mouse; touch uses the editor. */
function TimeGrid({
  days,
  today,
  view,
  items,
  dayLabel,
  onOpen,
  onDrop,
}: {
  days: string[];
  today: string;
  view: View;
  items: PlanItem[];
  dayLabel: (d: string) => string;
  onOpen: (item: PlanItem) => void;
  onDrop: (next: PlanItem, before: PlanItem) => void;
}) {
  const t = useTranslations("planner");
  const scroll = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ item: PlanItem; resize: boolean; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ item: PlanItem; resize: boolean } | null>(null);
  const [preview, setPreview] = useState<PlanItem | null>(null);

  // Open on the working day, not midnight.
  useEffect(() => {
    const node = scroll.current;
    const morning = node?.querySelector<HTMLElement>('[data-hour="8"]');
    if (node && morning) node.scrollTop += morning.getBoundingClientRect().top - node.getBoundingClientRect().top - 60;
  }, [view]);

  const cancel = () => {
    pointer.current = null;
    setDrag(null);
    setPreview(null);
  };
  const start = (e: PointerEvent<HTMLButtonElement>, item: PlanItem, resize: boolean) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !item.movable) return;
    suppressClick.current = false;
    pointer.current = { item, resize, x: e.clientX, y: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  // The quarter hour under the pointer: each hour cell is split into four.
  const target = (e: PointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drop]");
    if (!current || !cell || !scroll.current?.contains(cell)) return null;
    const [day, time] = cell.dataset.drop!.split("T");
    const box = cell.getBoundingClientRect();
    const quarter = Math.min(3, Math.max(0, Math.floor(((e.clientY - box.top) / box.height) * 4)));
    return moveItem(current.item, day, clock(minutes(time) + quarter * 15), current.resize);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    if (!current) return;
    if (!current.active && Math.hypot(e.clientX - current.x, e.clientY - current.y) < 6) return; // a click, not a drag
    current.active = true;
    setDrag({ item: current.item, resize: current.resize });
    setPreview(target(e));
  };
  const end = (e: PointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    const next = current?.active ? target(e) : null;
    if (current?.active) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
    cancel();
    if (current && next) onDrop(next, current.item);
  };
  const card = (item: PlanItem, timed: boolean) => (
    <EventCard key={item.id} item={item} items={items} onOpen={onOpen} drag={timed ? { start, move, end, cancel } : undefined} />
  );

  return (
    <div
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && pointer.current) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <p className="planner-drag-help">{t("dragHelp")}</p>
      {drag && (
        <p className="planner-drag-preview" role="status">
          {preview
            ? t(drag.resize ? "previewEnd" : "previewMove", { date: preview.date, start: preview.start, end: preview.end || "" })
            : t(drag.resize ? "resizing" : "moving", { title: drag.item.title })}
        </p>
      )}
      <div className="planner-grid-scroll" ref={scroll} tabIndex={0} aria-label={t("gridLabel")}>
        <div
          className={`planner-time-grid ${view === "day" ? "is-day" : ""}`}
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(${view === "day" ? 240 : 156}px, 1fr))` }}
        >
          <div className="planner-grid-heading">{t("time")}</div>
          {days.map((day) => (
            <div key={day} className={`planner-grid-heading ${day === today ? "is-today" : ""}`}>
              <span>{dayLabel(day)}</span>
              <strong>{day.slice(5)}</strong>
            </div>
          ))}
          <div className="planner-hour">{t("untimed")}</div>
          {days.map((day) => (
            <div className="planner-slot planner-undated" key={day}>
              {items.filter((e) => e.date === day && !e.start).map((item) => card(item, false))}
            </div>
          ))}
          {Array.from({ length: 24 }, (_, hour) => (
            <div className="planner-grid-row" key={hour}>
              <div className="planner-hour" data-hour={hour}>
                {clock(hour * 60)}
              </div>
              {days.map((day) => {
                const at = preview && Math.floor(minutes(drag?.resize ? preview.end || "00:00" : preview.start || "00:00") / 60);
                return (
                  <div className={`planner-slot ${preview?.date === day && at === hour ? "is-drop-target" : ""}`} key={day} data-drop={`${day}T${clock(hour * 60)}`}>
                    {items.filter((e) => e.date === day && e.start && Math.floor(minutes(e.start) / 60) === hour).map((item) => card(item, true))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type DragHandlers = {
  start: (e: PointerEvent<HTMLButtonElement>, item: PlanItem, resize: boolean) => void;
  move: (e: PointerEvent<HTMLButtonElement>) => void;
  end: (e: PointerEvent<HTMLButtonElement>) => void;
  cancel: () => void;
};

export function EventCard({ item, items, onOpen, drag }: { item: PlanItem; items: PlanItem[]; onOpen: (item: PlanItem) => void; drag?: DragHandlers }) {
  const t = useTranslations("planner");
  const labels = useLabels();
  const money = useMoney();
  const clash = conflicts(item, items).length > 0;
  return (
    <article className={`planner-event ${item.fixed ? "is-fixed" : "is-flexible"} ${clash ? "has-conflict" : ""} ${item.done ? "is-done" : ""}`} data-event-id={item.id}>
      <button
        className="planner-event-main"
        draggable={false}
        data-movable={!!drag && item.movable}
        onPointerDown={(e) => drag?.start(e, item, false)}
        onPointerMove={drag?.move}
        onPointerUp={drag?.end}
        onPointerCancel={drag?.cancel}
        onClick={() => onOpen(item)}
        aria-label={t("edit", { title: item.title })}
      >
        <span className="planner-event-meta">
          {item.fixed ? <LockKeyhole size={14} aria-hidden="true" /> : <Move size={14} aria-hidden="true" />}
          {t(item.fixed ? "fixed" : "flexible")} · {labels.calendarKind(item.kind)}
        </span>
        <strong>{item.title}</strong>
        <span className="planner-event-time">
          {item.start ? (item.end ? `${item.start}–${item.end}` : t("startsAt", { start: item.start })) : t("noTime")}
        </span>
        {item.project && <span>{item.project}</span>}
        {item.client && <span className="planner-event-meta">{item.client}</span>}
        {item.amount !== null && <span className="planner-event-meta">{money(Math.abs(item.amount))}</span>}
        {clash && <span className="planner-conflict">{t("conflict")}</span>}
        {item.note && <span className="planner-event-meta">{t("stated", { when: item.note })}</span>}
      </button>
      {drag && item.movable && item.end && (
        <button
          className="planner-resize"
          draggable={false}
          onPointerDown={(e) => drag.start(e, item, true)}
          onPointerMove={drag.move}
          onPointerUp={drag.end}
          onPointerCancel={drag.cancel}
          onClick={() => onOpen(item)}
          aria-label={t("resize", { title: item.title })}
        >
          {t("resizeShort")}
        </button>
      )}
    </article>
  );
}

/** Date and time of one item; fixed commitments and clashes are confirmed before saving. */
function TimeEditor({
  item,
  dropped,
  original,
  items,
  onClose,
  onSave,
  onFull,
}: {
  item: PlanItem;
  dropped: boolean;
  original: PlanItem;
  items: PlanItem[];
  onClose: () => void;
  onSave: (next: PlanItem, before: PlanItem) => void;
  onFull: () => void;
}) {
  const t = useTranslations("planner");
  const [draft, setDraft] = useState<PlanItem>(item);
  const [confirm, setConfirm] = useState(dropped);
  const [error, setError] = useState("");
  const overlaps = conflicts(draft, items);
  const changed = draft.date !== original.date || draft.start !== original.start || draft.end !== original.end;
  const submit = () => {
    if (!validItem(draft)) return setError(t("invalidTime"));
    if ((draft.fixed || overlaps.length) && !confirm) return setConfirm(true);
    onSave(draft, original);
  };
  return (
    <Modal title={t(confirm ? "confirmTitle" : "editTitle")} onClose={onClose}>
      <div className="planner-editor">
        <h3>{item.title}</h3>
        {item.project && (
          <p>
            {item.project}
            {item.client ? ` · ${item.client}` : ""}
          </p>
        )}
        {draft.fixed && changed && (
          <p className="planner-warning" role="alert">
            {t("fixedWarning")}
          </p>
        )}
        {confirm ? (
          <p>
            {t("from", { when: `${original.date} ${original.start}${original.end ? `–${original.end}` : ""}` })}
            <br />
            {t("to", { when: `${draft.date} ${draft.start}${draft.end ? `–${draft.end}` : ""}` })}
          </p>
        ) : (
          <>
            <label>
              {t("date")}
              <input type="date" required value={draft.date} onInput={(e) => {
                  const date = e.currentTarget.value; // read now: the event is gone when the update runs
                  setDraft((d) => ({ ...d, date }));
                }} />
            </label>
            <div className="planner-time-fields">
              <label>
                {t("start")}
                <input type="time" value={draft.start} onInput={(e) => {
                  const start = e.currentTarget.value; // read now: the event is gone when the update runs
                  setDraft((d) => ({ ...d, start }));
                }} />
              </label>
              <label>
                {t("end")}
                <input type="time" value={draft.end} onInput={(e) => {
                  const end = e.currentTarget.value; // read now: the event is gone when the update runs
                  setDraft((d) => ({ ...d, end }));
                }} />
              </label>
            </div>
          </>
        )}
        {!!overlaps.length && (
          <div className="planner-warning" role="alert">
            <strong>{t("conflict")}</strong>
            <p>{t("overlaps", { items: overlaps.map((e) => `${e.title} ${e.start}–${e.end}`).join("、") })}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="planner-warning">
            {error}
          </p>
        )}
        <div className="planner-actions">
          <button className="text-button" onClick={onFull}>
            {t("fullEdit")}
          </button>
          <button className="secondary" onClick={confirm ? () => setConfirm(false) : onClose}>
            {t(confirm ? "back" : "cancel")}
          </button>
          <button className="primary" disabled={!changed} onClick={submit}>
            {t(confirm ? "confirm" : "save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
