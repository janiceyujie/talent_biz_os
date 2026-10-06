"use client";

// Day and week calendar over the talent's real events, to-dos, and payment
// dates (lib/calendar/planner.ts), with the month view as the third tab.
// Dragging a timed item moves it in 15-minute steps and saves through the same
// action as the calendar form; a project's items and clashes ask first.
// Adapted from the prototype's planner
// (talent-business-os-prototype, src/components/planner/calendar.tsx).
import { ChevronLeft, ChevronRight, LockKeyhole, Move, Plus, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { PageHeader } from "@/components/app/page-header";
import { Toast } from "@/components/app/toast";
import { calendarRecord, RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { deleteCalendarItem, saveCalendarItem } from "@/lib/actions/calendar";
import { refreshGoogleCalendars } from "@/lib/actions/google-calendar";
import { at, clock, conflicts, layoutDay, minutes, moveItem, planItems, plusDays, segment, validItem, weekStart, type PlanItem } from "@/lib/calendar/planner";
import { dateInZone } from "@/lib/domain/dates";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { CalendarView } from "./calendar";

type View = "day" | "week" | "month";
type Edge = "move" | "start" | "end";
/** On a day: starts there, or a timed item still running (an overnight event on its second day). */
const onDay = (item: PlanItem, day: string) => item.date === day || (!!item.start && !!segment(item, day));

/** `initialDay` opens the month filtered to that day (reminder links); `initialDate` opens that day's schedule. */
export function PlannerView({ initialDay = "", initialDate = "" }: { initialDay?: string; initialDate?: string }) {
  const data = useAppData();
  const t = useTranslations("planner");
  const format = useFormatter();
  const today = dateInZone(data.talent.timeZone);
  const [view, setView] = useState<View>(initialDay ? "month" : initialDate ? "day" : "week");
  const [date, setDate] = useState(initialDay || initialDate || today);
  // The item being edited; `dropped` when it came from a drag, so the dialog only asks to confirm.
  const [editing, setEditing] = useState<(PlanItem & { dropped?: boolean }) | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const saved = useMemo(() => planItems(data), [data]);
  // A move shows at once; the server's answer replaces it.
  const [items, show] = useOptimistic(saved, (state, moved: PlanItem) => state.map((i) => (i.id === moved.id ? moved : i)));

  /** Save a new date and time through the calendar form's action. */
  const save = (next: PlanItem) =>
    startTransition(async () => {
      const c = data.calendar.find((x) => x.id === next.ref.id && x.source === next.ref.source);
      if (!c) return;
      show(next);
      const failure = await saveCalendarItem({
        ...calendarRecord(c),
        date: next.date,
        time: next.start,
        endDate: next.end ? next.endDate : "",
        endTime: next.end,
      });
      if (failure) return setMessage(failure);
      setMessage(t("moved", { title: next.title }));
    });
  // Right-click menu and delete confirmation. Payment dates are voided in the ledger, not deleted here.
  const [menu, setMenu] = useState<{ item: PlanItem; x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState<PlanItem | null>(null);
  const onMenu = (item: PlanItem, e: ReactMouseEvent) => {
    if (item.ref.source === "payment" || item.ref.source === "google") return; // not ours to delete here
    e.preventDefault();
    setMenu({ item, x: e.clientX, y: e.clientY });
  };
  const remove = (item: PlanItem) =>
    startTransition(async () => {
      if (item.ref.source === "payment" || item.ref.source === "google") return;
      const failure = await deleteCalendarItem(item.ref.id, item.ref.source);
      if (failure) return setMessage(failure);
      setMessage(t("deleted", { title: item.title }));
    });
  // The person's own Google calendars (decision 0009, phase 2): read again on opening and every few
  // minutes while the calendar is open (the server skips it if read in the last two minutes).
  const importing = data.googleCalendar.importing.length > 0;
  useEffect(() => {
    if (!importing) return;
    void refreshGoogleCalendars();
    const timer = setInterval(() => void refreshGoogleCalendars(), 3 * 60_000);
    return () => clearInterval(timer);
  }, [importing]);
  const open = (item: PlanItem) => {
    // A Google event opens in Google Calendar: it's read-only here.
    if (item.ref.source === "google") return void (item.ref.link && window.open(item.ref.link, "_blank", "noopener"));
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
      {/* The calendar is the page: every control shares the title's row; help sits behind ⓘ. */}
      <PageHeader titleKey="calendar">
        {view !== "month" && (
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
        )}
        <span className="planner-toolbar-spacer" />
        <select className="planner-view-select" aria-label={t("views")} value={view} onChange={(e) => setView(e.target.value as View)}>
          {(["day", "week", "month"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`view.${v}`)}
            </option>
          ))}
        </select>
        {view !== "month" && (
          <>
            <input
              className="planner-go-to"
              type="date"
              aria-label={t("goTo")}
              title={t("goTo")}
              value={date}
              onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
            />
          </>
        )}
        <button className="primary" title={t("add")} aria-label={t("add")} onClick={() => setEditor({ kind: "calendar", item: { date } })}>
          <Plus size={16} aria-hidden="true" />
          {t("create")}
        </button>
      </PageHeader>
      {view === "month" ? (
        <CalendarView initialDay={initialDay} hideAdd />
      ) : (
        <>
          <TimeGrid
            days={days}
            timeZone={data.talent.timeZone}
            today={today}
            view={view}
            items={items}
            dayLabel={dayLabel}
            onOpen={open}
            onMenu={onMenu}
            onDrop={(next) => {
              if (!validItem(next)) return setMessage(t("invalidMove"));
              // Fixed commitments and clashes are confirmed in the editor; flexible work just moves.
              if (next.fixed || conflicts(next, items).length) setEditing({ ...next, dropped: true });
              else save(next);
            }}
            onCreate={(day, time) => {
              // A new event at the clicked time, an hour long; the form sets the rest.
              const endAt = minutes(time) + NEW_LENGTH;
              setEditor({
                kind: "calendar",
                item: {
                  date: day,
                  time,
                  endDate: endAt >= 1440 ? plusDays(day, 1) : day,
                  endTime: clock(endAt % 1440),
                  kind: "meeting",
                  timeZone: data.talent.timeZone,
                },
              });
            }}
          />
          <div className="planner-mobile-agenda">
            {days.map((day) => (
              <section key={day}>
                <h3>
                  {day.slice(5)} · {dayLabel(day)}
                  {day === today ? ` · ${t("today")}` : ""}
                </h3>
                {items.filter((e) => onDay(e, day)).map((item) => (
                  <EventCard key={item.id} item={item} items={items} onOpen={open} onMenu={onMenu} />
                ))}
                {!items.some((e) => onDay(e, day)) && <p className="muted">{t("nothing")}</p>}
              </section>
            ))}
          </div>
          {!items.some((e) => days.some((d) => onDay(e, d))) && <p className="notice">{t("emptyRange")}</p>}
        </>
      )}
      {message && <Toast message={message} onClose={() => setMessage("")} />}
      {menu && <ItemMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} onDelete={() => (setDeleting(menu.item), setMenu(null))} />}
      {deleting && (
        <Modal title={t("deleteTitle")} onClose={() => setDeleting(null)}>
          <p>
            <strong>{deleting.title}</strong>
            <br />
            {deleting.date} {deleting.start}
            {deleting.end ? `–${deleting.endDate !== deleting.date ? `${deleting.endDate} ` : ""}${deleting.end}` : ""}
            {deleting.project ? ` · ${deleting.project}` : ""}
          </p>
          <p className="muted">{t("deleteBody")}</p>
          <footer className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              {t("cancel")}
            </button>
            <button
              className="primary danger"
              onClick={() => {
                const item = deleting;
                setDeleting(null);
                remove(item);
              }}
            >
              {t("delete")}
            </button>
          </footer>
        </Modal>
      )}
      {editing && (
        <TimeEditor
          key={`${editing.id}${editing.date}${editing.start}${editing.end}`}
          item={editing}
          dropped={!!editing.dropped}
          original={saved.find((i) => i.id === editing.id) ?? editing}
          items={items}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setEditing(null);
            save(next);
          }}
          onDelete={() => {
            setDeleting(editing);
            setEditing(null);
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

// Grid settings, in one place. HOUR also sets the CSS variable --hour, so the drawn hour lines and the
// block positions can't drift apart.
const HOUR = 56; // px per hour
const SNAP = 5; // minutes: dragging moves in 5-minute steps
const CLICK_STEP = 15; // minutes: a click on empty time starts on the quarter hour
const NEW_LENGTH = 60; // minutes: a new event from a click is an hour long until edited
const OPEN_AT_HOUR = 8; // the grid first scrolls to the working day, not midnight
const POINT_PX = 26; // height of an item with a start but no end
const MIN_BLOCK_PX = 18; // a very short item stays clickable
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const toWall = (value: number) => {
  const d = new Date(Math.floor(value / 1440) * 86400000);
  return { date: d.toISOString().slice(0, 10), time: clock(((value % 1440) + 1440) % 1440) };
};

/**
 * Days side by side, each a column 24 hours tall: a block sits at its start
 * time and is as tall as it lasts; overlapping blocks share the width.
 * Dragging a block moves it, its top and bottom edges change the start and
 * end (mouse; touch uses the editor), and clicking empty time adds an event.
 */
function TimeGrid({
  days,
  today,
  view,
  items,
  dayLabel,
  timeZone,
  onOpen,
  onMenu,
  onDrop,
  onCreate,
}: {
  days: string[];
  timeZone: string;
  today: string;
  view: View;
  items: PlanItem[];
  dayLabel: (d: string) => string;
  onOpen: (item: PlanItem) => void;
  onMenu: (item: PlanItem, e: ReactMouseEvent) => void;
  onDrop: (next: PlanItem) => void;
  onCreate: (date: string, time: string) => void;
}) {
  const t = useTranslations("planner");
  const locale = useLocale();
  const scroll = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ item: PlanItem; edge: Edge; grab: number; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ item: PlanItem; edge: Edge } | null>(null);

  // Open on the working day, not midnight.
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = OPEN_AT_HOUR * HOUR - 8;
  }, [view]);

  /** The day and minute under the pointer, as minutes since the epoch (see `at`). */
  const pointAt = (x: number, y: number) => {
    const col = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]");
    if (!col || !scroll.current?.contains(col)) return null;
    const minute = Math.min(1440, Math.max(0, ((y - col.getBoundingClientRect().top) / HOUR) * 60));
    return at(col.dataset.day!, "00:00") + minute;
  };
  const target = (e: PointerEvent<HTMLElement>) => {
    const current = pointer.current;
    const point = current && pointAt(e.clientX, e.clientY);
    if (!current || point === null) return null;
    const { date, time } = toWall(snap(point - current.grab));
    return moveItem(current.item, date, time, current.edge);
  };
  const start = (e: PointerEvent<HTMLElement>, item: PlanItem, edge: Edge) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !item.movable) return;
    e.stopPropagation();
    const point = pointAt(e.clientX, e.clientY);
    // Moving keeps where the block was grabbed; an edge follows the pointer.
    const grab = edge === "move" && point !== null ? point - at(item.date, item.start) : 0;
    suppressClick.current = false;
    pointer.current = { item, edge, grab, x: e.clientX, y: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const current = pointer.current;
    if (!current) return;
    if (!current.active && Math.hypot(e.clientX - current.x, e.clientY - current.y) < 5) return; // a click, not a drag
    current.active = true;
    const next = target(e);
    setPreview(next ? { item: next, edge: current.edge } : null);
  };
  const cancel = () => {
    pointer.current = null;
    setPreview(null);
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    const current = pointer.current;
    const next = current?.active ? target(e) : null;
    if (current?.active) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
    cancel();
    const i = current?.item;
    if (i && next && (next.date !== i.date || next.start !== i.start || next.end !== i.end || next.endDate !== i.endDate)) onDrop(next);
  };
  // Clicking empty time adds an event there, on the quarter hour.
  const create = (e: ReactMouseEvent<HTMLElement>, day: string) => {
    if (suppressClick.current || (e.target as HTMLElement).closest(".cal-block")) return;
    const minute = Math.floor((((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR) * 60) / CLICK_STEP) * CLICK_STEP;
    onCreate(day, clock(Math.min(1440 - CLICK_STEP, Math.max(0, minute))));
  };

  // While dragging, the preview stands in for the dragged item.
  const shown = preview ? items.map((i) => (i.id === preview.item.id ? preview.item : i)) : items;
  const blocks = (day: string) => {
    const segs = shown.flatMap((item) => {
      const seg = segment(item, day);
      return seg ? [{ id: item.id, item, ...seg }] : [];
    });
    const lanes = layoutDay(segs, (POINT_PX / HOUR) * 60); // an item without an end takes the room its marker needs
    return segs.map((s) => ({ ...s, ...lanes.get(s.id)! }));
  };
  const handle = (item: PlanItem, edge: Edge) => (
    <span
      className={`cal-handle cal-handle-${edge}`}
      title={t("resize", { title: item.title })}
      onPointerDown={(e) => start(e, item, edge)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    />
  );

  return (
    <div
      className="cal"
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
      <p className="planner-drag-preview" role="status">
        {preview
          ? t(preview.edge === "end" ? "previewEnd" : preview.edge === "start" ? "previewStart" : "previewMove", {
              date: preview.edge === "end" ? preview.item.endDate : preview.item.date,
              start: preview.item.start,
              end: preview.item.end || "",
            })
          : ""}
      </p>
      <div
        className="cal-frame"
        style={{ ["--hour" as string]: `${HOUR}px`, ["--cal-days" as string]: days.length, ["--cal-min" as string]: view === "day" ? "240px" : "120px" }}
      >
        <div className="cal-head">
          {/* Every time on the grid is in the talent's zone: its offset here, the full name on hover. */}
          <div className="cal-corner" title={t("zone", { zone: timeZone })}>
            {zoneOffset(days[0], timeZone, locale)}
          </div>
          {days.map((day) => (
            <div key={day} className={`cal-day-head ${day === today ? "is-today" : ""}`}>
              <span>{dayLabel(day)}</span>
              <strong>{day.slice(5)}</strong>
            </div>
          ))}
          <div className="cal-corner cal-allday-label">{t("untimed")}</div>
          {days.map((day) => (
            <div className="cal-allday" key={day}>
              {items
                .filter((i) => i.date === day && !i.start)
                .map((item) => (
                  <EventCard key={item.id} item={item} items={items} onOpen={onOpen} onMenu={onMenu} compact />
                ))}
            </div>
          ))}
        </div>
        <div className="cal-body" ref={scroll} tabIndex={0} aria-label={t("gridLabel")}>
          <div className="cal-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {clock(h * 60)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className={`cal-col ${day === today ? "is-today" : ""}`} data-day={day} onClick={(e) => create(e, day)} title={t("clickToAdd")}>
              {blocks(day).map((b) => {
                const item = b.item;
                const height = b.open ? POINT_PX : Math.max(((b.to - b.from) / 60) * HOUR, MIN_BLOCK_PX);
                const clash = conflicts(item, items).length > 0;
                return (
                  <article
                    key={b.id}
                    data-event-id={item.id}
                    className={`cal-block ${item.external ? "is-external" : item.fixed ? "is-fixed" : "is-flexible"} ${clash ? "has-conflict" : ""} ${preview?.item.id === item.id ? "is-dragging" : ""} ${item.done ? "is-done" : ""}`}
                    style={{
                      top: (b.from / 60) * HOUR,
                      height,
                      left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / b.lanes}% - 4px)`,
                      ...(item.external?.color ? { borderLeftColor: item.external.color } : {}),
                    }}
                    onContextMenu={(e) => onMenu(item, e)}
                    title={
                      item.external
                        ? t("hintGoogle", { calendar: item.external.calendar })
                        : item.movable
                        ? [item.fixed ? t("hintProject") : "", item.end ? t("hintMoveResize") : t("hintMove"), t("hintDelete")].filter(Boolean).join(" · ")
                        : t("hintOpen")
                    }
                  >
                    {/* Edges are draggable where the item really starts or ends on this day. */}
                    {item.movable && item.end && item.date === day && handle(item, "start")}
                    <button
                      className="cal-block-main"
                      data-movable={item.movable}
                      onPointerDown={(e) => start(e, item, "move")}
                      onPointerMove={move}
                      onPointerUp={end}
                      onPointerCancel={cancel}
                      onClick={() => onOpen(item)}
                      aria-label={t("edit", { title: item.title })}
                    >
                      <strong>{item.title || t("untitled")}</strong>
                      <span>
                        {item.end ? `${item.start}–${item.endDate !== item.date ? `${item.endDate.slice(5)} ` : ""}${item.end}` : t("startsAt", { start: item.start })}
                        {item.project ? ` · ${item.project}` : ""}
                      </span>
                      {clash && <span className="planner-conflict">{t("conflict")}</span>}
                    </button>
                    {item.movable && item.end && item.endDate === day && handle(item, "end")}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EventCard({
  item,
  items,
  onOpen,
  onMenu,
  compact = false,
}: {
  item: PlanItem;
  items: PlanItem[];
  onOpen: (item: PlanItem) => void;
  onMenu?: (item: PlanItem, e: ReactMouseEvent) => void;
  compact?: boolean;
}) {
  const t = useTranslations("planner");
  const labels = useLabels();
  const money = useMoney();
  const clash = conflicts(item, items).length > 0;
  return (
    <article
      className={`planner-event ${item.external ? "is-external" : item.fixed ? "is-fixed" : "is-flexible"} ${clash ? "has-conflict" : ""} ${item.done ? "is-done" : ""}`}
      data-event-id={item.id}
      onContextMenu={onMenu && ((e) => onMenu(item, e))}
    >
      <button className="planner-event-main" onClick={() => onOpen(item)} aria-label={t("edit", { title: item.title })}>
        {!compact &&
          (item.external ? (
            <span className="planner-event-meta">{t("fromGoogle", { calendar: item.external.calendar })}</span>
          ) : (
            <span className="planner-event-meta">
              {item.fixed ? <LockKeyhole size={14} aria-hidden="true" /> : <Move size={14} aria-hidden="true" />}
              {t(item.fixed ? "fixed" : "flexible")} · {labels.calendarKind(item.kind)}
            </span>
          ))}
        <strong>{item.title || t("untitled")}</strong>
        <span className="planner-event-time">
          {item.start
            ? item.end
              ? `${item.start}–${item.endDate !== item.date ? `${item.endDate.slice(5)} ` : ""}${item.end}`
              : t("startsAt", { start: item.start })
            : t("noTime")}
        </span>
        {!compact && item.project && <span>{item.project}</span>}
        {!compact && item.client && <span className="planner-event-meta">{item.client}</span>}
        {item.amount !== null && <span className="planner-event-meta">{money(Math.abs(item.amount))}</span>}
        {clash && <span className="planner-conflict">{t("conflict")}</span>}
        {item.note && <span className="planner-event-meta">{t("stated", { when: item.note })}</span>}
      </button>
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
  onDelete,
  onFull,
}: {
  item: PlanItem;
  dropped: boolean;
  original: PlanItem;
  items: PlanItem[];
  onClose: () => void;
  onSave: (next: PlanItem) => void;
  onDelete: () => void;
  onFull: () => void;
}) {
  const t = useTranslations("planner");
  const [draft, setDraft] = useState<PlanItem>(item);
  // The value is read before the update: React runs the update after the input event is gone.
  const set = (key: "date" | "start" | "endDate" | "end", value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const [confirm, setConfirm] = useState(dropped);
  const [error, setError] = useState("");
  const overlaps = conflicts(draft, items);
  const changed = draft.date !== original.date || draft.start !== original.start || draft.end !== original.end || draft.endDate !== original.endDate;
  const submit = () => {
    if (!validItem(draft)) return setError(t("invalidTime"));
    if ((draft.fixed || overlaps.length) && !confirm) return setConfirm(true);
    onSave(draft);
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
            {t("fixedWarning", { project: item.project })}
          </p>
        )}
        {confirm ? (
          <ChangeSummary before={original} after={draft} />
        ) : (
          // Start and end as pairs: day and time side by side.
          <div className="planner-time-fields">
            <label>
              {t("startDate")}
              <input type="date" required value={draft.date} onInput={(e) => set("date", e.currentTarget.value)} />
            </label>
            <label>
              {t("start")}
              <input type="time" value={draft.start} onInput={(e) => set("start", e.currentTarget.value)} />
            </label>
            <label>
              {t("endDate")}
              <input type="date" value={draft.endDate} onInput={(e) => set("endDate", e.currentTarget.value)} />
            </label>
            <label>
              {t("end")}
              <input type="time" value={draft.end} onInput={(e) => set("end", e.currentTarget.value)} />
            </label>
          </div>
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
        <div className="planner-actions planner-editor-actions">
          {/* Deleting sits apart, on the left; the everyday actions on the right. */}
          {!confirm && (
            <button className="secondary danger-outline" onClick={onDelete}>
              <Trash2 size={16} aria-hidden="true" />
              {t("delete")}
            </button>
          )}
          <span className="planner-actions-spacer" />
          {!confirm && (
            <button className="secondary" onClick={onFull}>
              {t("fullEdit")}
            </button>
          )}
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

/** The right-click menu: one action for now. Closes on any outside click, scroll, or Escape. */
function ItemMenu({ x, y, onClose, onDelete }: { x: number; y: number; onClose: () => void; onDelete: () => void }) {
  const t = useTranslations("planner");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  // Keep the menu on screen near the pointer.
  const left = Math.min(x, (typeof window === "undefined" ? x : window.innerWidth) - 180);
  const top = Math.min(y, (typeof window === "undefined" ? y : window.innerHeight) - 60);
  return (
    <div ref={ref} className="cal-menu" role="menu" style={{ left, top }}>
      <button role="menuitem" className="danger-text" onClick={onDelete}>
        <Trash2 size={16} aria-hidden="true" />
        {t("delete")}
      </button>
    </div>
  );
}

/** Only what a change changes: the day if it moved, the times, and the length if it changed. */
function ChangeSummary({ before, after }: { before: PlanItem; after: PlanItem }) {
  const t = useTranslations("planner");
  const format = useFormatter();
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });
  const times = (i: PlanItem) => (i.end ? `${i.start}–${i.endDate !== i.date ? `${day(i.endDate)} ` : ""}${i.end}` : i.start);
  const length = (i: PlanItem) => {
    if (!i.end) return "";
    const total = at(i.endDate, i.end) - at(i.date, i.start);
    return t("length", { hours: Math.floor(total / 60), minutes: total % 60 });
  };
  const rows = [
    [t("changeDay"), day(before.date), day(after.date)],
    [t("changeTime"), times(before), times(after)],
    [t("changeLength"), length(before), length(after)],
  ].filter(([, was, now]) => was !== now);
  return (
    <dl className="change-summary">
      {rows.map(([label, was, now]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            <s>{was}</s> → <strong>{now}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The zone's short offset (e.g. "GMT+8") on a date, so daylight-saving changes show. */
function zoneOffset(date: string, timeZone: string, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date(`${date}T12:00:00Z`));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
