"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { halfHourTimes } from "@/lib/calendar/input";

const DEFAULT_SHOWN = "09:00";

/** Every half hour, scrolled to the current time; a typed time that's between them is listed first. */
export function TimePickerPanel({
  value,
  typed,
  focusList,
  optional,
  onPick,
  onClose,
}: {
  value: string;
  typed: string | null; // what's being typed, once it reads as a time
  focusList: boolean; // opened from the keyboard: arrows move through the list
  optional: boolean;
  onPick: (time: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dateTimeInput");
  const list = useRef<HTMLDivElement>(null);
  const current = typed || value;
  const times = current && !halfHourTimes.includes(current) ? [current, ...halfHourTimes] : halfHourTimes;

  // Centered on the current time; with none yet, on the morning rather than midnight.
  useEffect(() => {
    const menu = list.current;
    const selected = menu?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? menu?.querySelector<HTMLButtonElement>(`[data-time-index="${times.indexOf(DEFAULT_SHOWN)}"]`);
    if (menu && selected) menu.scrollTop = selected.offsetTop - menu.offsetTop - (menu.clientHeight - selected.offsetHeight) / 2;
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps -- `times` follows `current`
  useEffect(() => {
    if (focusList) (list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? list.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [focusList]);

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = { ArrowDown: Math.min(index + 1, times.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: times.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    list.current?.querySelector<HTMLButtonElement>(`[data-time-index="${to}"]`)?.focus();
  };

  return (
    <div className="time-picker-panel">
      <header>
        <strong>{t("chooseTime")}</strong>
        <button type="button" className="icon-button" aria-label={t("close")} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div ref={list} className="time-picker-options" role="group" aria-label={t("chooseTime")}>
        {times.map((time, index) => (
          <button
            type="button"
            key={time}
            data-time-index={index}
            aria-pressed={time === current}
            onMouseDown={(e) => e.preventDefault()} // the field keeps focus, so it doesn't commit what's half typed
            onKeyDown={(e) => move(e, index)}
            onClick={() => onPick(time)}
          >
            {time}
          </button>
        ))}
      </div>
      <footer>
        {optional && (
          <button type="button" className="text-button" onClick={() => onPick("")}>
            {t("clear")}
          </button>
        )}
        <span className="date-time-help">{t("timeHint")}</span>
      </footer>
    </div>
  );
}
