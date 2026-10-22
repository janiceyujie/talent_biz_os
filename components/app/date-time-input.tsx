"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { parseDateInput, parseTimeInput } from "@/lib/calendar/input";
import { DatePickerPanel } from "./date-picker-panel";
import { TimePickerPanel } from "./time-picker-panel";

// A phone or tablet: the system's own picker (a wheel or a calendar) beats one drawn on the page.
const TOUCH = "(pointer: coarse)";
const subscribe = (change: () => void) => {
  const query = window.matchMedia(TOUCH);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useTouch = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(TOUCH).matches,
    () => false, // the server draws the typed field; a touch device swaps it in on load
  );

type Props = {
  disabled?:boolean;
  kind: "date" | "time";
  label: string;
  value: string; // YYYY-MM-DD or HH:mm; "" when not set
  onChange: (value: string) => void;
  today: string; // the talent's today, where the calendar opens without a value
  required?: boolean;
  hideLabel?: boolean;
  field?: string; // data-field, for a form that opens at one field
  min?: string;
  className?: string;
};

/**
 * A date or time field. With a mouse and keyboard it's typed (20261012,
 * 2026/10/12, 930, 9:30pm), in the same order whatever the browser's
 * language, with a calendar or a list of half hours beside it. Native date
 * fields follow the browser's language instead: a Chinese page showed
 * mm/dd/yyyy. On a touch screen it's the native field, for the system picker.
 */
export function DateTimeInput({disabled=false, kind, label, value, onChange, today, required = false, hideLabel = false, field, min, className = "" }: Props) {
  const t = useTranslations("dateTimeInput");
  const touch = useTouch();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [query, setQuery] = useState<string | null>(null); // what's typed, until it's committed
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState(false); // opened from the keyboard: the list takes focus
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const parse = kind === "date" ? parseDateInput : parseTimeInput;
  const display = (v: string) => (kind === "date" ? v.replaceAll("-", "/") : v);
  const invalid = t(kind === "date" ? "invalidDate" : "invalidTime");

  // A new value from outside (another field, a reset) replaces what was typed, unless the person is typing.
  useEffect(() => {
    if (focused.current) return;
    queueMicrotask(() => {
      setQuery(null);
      setError("");
      input.current?.setCustomValidity("");
    });
  }, [value]);

  // The picker sits under the field, or above it when there's no room below, inside the window.
  const place = () => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = document.documentElement.clientWidth;
    const width = Math.min(kind === "date" ? 304 : 240, viewport - 24);
    const height = panel.current?.offsetHeight || (kind === "date" ? 384 : 320);
    const top = rect.bottom + 8 + height <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
    setPosition({ left: Math.max(12, Math.min(rect.left, viewport - width - 12)), top, width, maxHeight: window.innerHeight - 24 });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open, kind]); // eslint-disable-line react-hooks/exhaustive-deps -- measured once its contents are in
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, kind]); // eslint-disable-line react-hooks/exhaustive-deps -- place reads the refs and the window as they are

  if (touch)
    return (
      <label className={`date-time-field ${className}`}>
        <span className={hideLabel ? "sr-only" : ""}>
          {label}
          {required && !hideLabel ? " *" : ""}
        </span>
        <input disabled={disabled} type={kind} data-field={field} required={required} min={min} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );

  const close = () => {
    panel.current?.hidePopover();
    input.current?.focus();
  };
  const show = (fromKeyboard = false) => {
    setKeyboard(fromKeyboard);
    place();
    panel.current?.showPopover();
  };
  // Typing sets the value as soon as it's a real date or time; leaving the field says what's wrong.
  const commit = (raw: string, leaving = false) => {
    const parsed = parse(raw);
    const problem = parsed === "" && required ? t("required") : parsed === null || (parsed && min && parsed < min) ? invalid : "";
    input.current?.setCustomValidity(problem);
    if (problem) {
      if (leaving) setError(problem);
      return;
    }
    setError("");
    onChange(parsed!);
    if (leaving) setQuery(null);
  };
  const pick = (next: string) => {
    input.current?.setCustomValidity("");
    setError("");
    setQuery(null);
    onChange(next);
    close();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || (kind === "time" && e.key === "ArrowUp")) {
      e.preventDefault();
      show(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(query ?? display(value), true);
      if (open) close();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // the picker closes, not the dialog around it
      close();
    }
  };

  return (
    <div className={`date-time-field ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : ""}>
        {label}
        {required && !hideLabel ? " *" : ""}
      </label>
      <div className="date-time-control">
        <input disabled={disabled}
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="none"
          aria-haspopup="dialog"
          aria-controls={`${id}-panel`}
          aria-expanded={open}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          data-field={field}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t(kind === "date" ? "datePlaceholder" : "timePlaceholder")}
          maxLength={kind === "date" ? 12 : 20}
          required={required}
          value={query ?? display(value)}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setError("");
            commit(e.target.value);
          }}
          onBlur={() => {
            focused.current = false;
            commit(query ?? display(value), true);
          }}
          onInvalid={() => setError(input.current?.validity.valueMissing ? t("required") : invalid)}
          onKeyDown={onKey}
        />
        <button disabled={disabled}
          type="button"
          className="date-time-trigger"
          aria-label={t(kind === "date" ? "openDate" : "openTime", { label })}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => (open ? close() : show())}
        >
          {kind === "date" ? <CalendarDays size={17} aria-hidden="true" /> : <Clock3 size={17} aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <small id={`${id}-error`} className="date-time-error" role="alert">
          {error}
        </small>
      )}
      <div
        ref={panel}
        id={`${id}-panel`}
        popover="auto"
        role="dialog"
        aria-label={t(kind === "date" ? "openDate" : "openTime", { label })}
        className="date-time-popover"
        style={position}
        onToggle={(e) => setOpen(e.newState === "open")}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
      >
        {open &&
          (kind === "date" ? (
            <DatePickerPanel value={parseDateInput(value) || ""} today={today} min={min} optional={!required} onPick={pick} onClose={close} />
          ) : (
            <TimePickerPanel value={value} typed={query === null ? null : parseTimeInput(query)} focusList={keyboard} optional={!required} onPick={pick} onClose={close} />
          ))}
      </div>
    </div>
  );
}
