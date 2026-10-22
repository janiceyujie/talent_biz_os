"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { addDateDays, addDateMonths } from "@/lib/calendar/input";

const atNoon = (date: string) => new Date(`${date}T12:00:00Z`);

/** A month of days to pick from, keyboard first: arrows by day and week, Page Up and Down by month, Home and End to the week's ends. */
export function DatePickerPanel({
  value,
  today,
  min,
  optional,
  onPick,
  onClose,
}: {
  value: string;
  today: string;
  min?: string;
  optional: boolean;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dateTimeInput");
  const locale = useLocale();
  const [cursor, setCursor] = useState(value || today);
  const grid = useRef<HTMLDivElement>(null);
  const first = `${cursor.slice(0, 7)}-01`;
  const days = Array.from({ length: 42 }, (_, i) => addDateDays(first, i - atNoon(first).getUTCDay())); // six weeks from Sunday
  const month = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(atNoon(first));
  const fullDate = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(atNoon(date));
  const weekday = (i: number) => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i)));

  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();
  }, [cursor]);

  const move = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const day = atNoon(date).getUTCDay();
    const next: Record<string, string> = {
      ArrowLeft: addDateDays(date, -1),
      ArrowRight: addDateDays(date, 1),
      ArrowUp: addDateDays(date, -7),
      ArrowDown: addDateDays(date, 7),
      PageUp: addDateMonths(date, -1),
      PageDown: addDateMonths(date, 1),
      Home: addDateDays(date, -day),
      End: addDateDays(date, 6 - day),
    };
    if (!next[e.key]) return;
    e.preventDefault();
    setCursor(next[e.key]);
  };

  return (
    <div ref={grid} className="date-picker-panel">
      <header>
        <button type="button" className="icon-button" aria-label={t("previousMonth")} onClick={() => setCursor(addDateMonths(cursor, -1))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <strong aria-live="polite">{month}</strong>
        <button type="button" className="icon-button" aria-label={t("nextMonth")} onClick={() => setCursor(addDateMonths(cursor, 1))}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label={t("close")} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="date-picker-weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{weekday(i)}</span>
        ))}
      </div>
      <div role="grid" aria-label={month} className="date-picker-grid">
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" key={week}>
            {days.slice(week * 7, week * 7 + 7).map((date) => (
              <div role="gridcell" key={date} aria-selected={date === value}>
                <button
                  type="button"
                  data-day={date}
                  tabIndex={date === cursor ? 0 : -1}
                  disabled={!!min && date < min}
                  aria-label={fullDate(date)}
                  aria-current={date === today ? "date" : undefined}
                  className={[date === value && "selected", date === today && "today", date.slice(0, 7) !== cursor.slice(0, 7) && "outside"].filter(Boolean).join(" ")}
                  onKeyDown={(e) => move(e, date)}
                  onClick={() => onPick(date)}
                >
                  {Number(date.slice(-2))}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <footer>
        <button type="button" className="text-button" disabled={!!min && today < min} onClick={() => onPick(today)}>
          {t("today")}
        </button>
        {optional && (
          <button type="button" className="text-button" onClick={() => onPick("")}>
            {t("clear")}
          </button>
        )}
      </footer>
      <p className="date-time-help">{t("dateHint")}</p>
    </div>
  );
}
