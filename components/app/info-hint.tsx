"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const SCREEN_MARGIN = 16;

/** Secondary, plain-text help available by pointer, keyboard, or touch. */
export function InfoHint({ notes, label, above = false }: { notes: string[]; label?: string; above?: boolean }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const shown = !dismissed && (open || hovered || focused);

  useLayoutEffect(() => {
    if (!shown) return;
    const position = () => {
      const el = body.current;
      if (!el) return;
      el.style.removeProperty("--shift");
      el.removeAttribute("data-above");
      const bounds = el.getBoundingClientRect();
      const shift = Math.min(0, document.documentElement.clientWidth - SCREEN_MARGIN - bounds.right);
      el.style.setProperty("--shift", `${Math.max(shift, SCREEN_MARGIN - bounds.left)}px`);
      if (bounds.bottom > window.innerHeight - SCREEN_MARGIN && (ref.current?.getBoundingClientRect().top ?? 0) > bounds.height + SCREEN_MARGIN) {
        el.setAttribute("data-above", "true");
      }
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    const hide = () => { setOpen(false); setDismissed(true); };
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) hide(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [shown]);

  return (
    <span ref={ref} className={`info-hint ${above ? "above" : ""} ${shown ? "is-open" : ""}`}
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={() => { setFocused(false); setOpen(false); }}>
      <button type="button" className="info-hint-button"
        aria-label={label ? `${label}: ${t("about")}` : t("about")}
        aria-expanded={shown} aria-describedby={shown ? id : undefined}
        onClick={() => { setOpen(!open); setDismissed(open); }}>
        <Info size={16} aria-hidden="true" />
      </button>
      <span ref={body} role="tooltip" id={id} className="info-hint-body">
        {notes.map(note => <span key={note}>{note}</span>)}
      </span>
    </span>
  );
}
