"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const SCREEN_MARGIN = 16; // px kept clear of the window's right edge

/**
 * An ⓘ beside a title, with that section's explanation behind it: shown on
 * hover and keyboard focus, and toggled by a tap (phones have no hover).
 * Notes are plain text, one per line, so it can sit inside a heading.
 * `above` opens it upward, where below would cover what it explains;
 * `bulleted` marks each note as a list item, for several separate points.
 */
export function InfoHint({ notes, above = false, bulleted = false }: { notes: string[]; above?: boolean; bulleted?: boolean }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false); // tapped open; stays until a tap elsewhere
  const [peek, setPeek] = useState(false); // hovered or focused
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const shown = open || peek;
  const hide = () => {
    setOpen(false);
    setPeek(false);
  };
  // Keep it on screen: shift left when it would run past the right edge (a title near the right, or a phone).
  useLayoutEffect(() => {
    const el = body.current;
    if (!shown || !el) return;
    el.style.removeProperty("--shift");
    const over = el.getBoundingClientRect().right - (window.innerWidth - SCREEN_MARGIN);
    if (over > 0) el.style.setProperty("--shift", `${-over}px`);
  }, [shown]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <span
      ref={ref}
      className={`info-hint ${above ? "above" : ""} ${shown ? "is-open" : ""}`}
      onMouseEnter={() => setPeek(true)}
      onMouseLeave={() => setPeek(false)}
      onFocus={() => setPeek(true)}
      onBlur={() => setPeek(false)}
      onKeyDown={(e) => e.key === "Escape" && hide()}
    >
      <button type="button" className="info-hint-button" aria-label={t("about")} aria-expanded={shown} aria-describedby={id} onClick={() => (open ? hide() : setOpen(true))}>
        <Info size={16} aria-hidden="true" />
      </button>
      <span ref={body} role="tooltip" id={id} className={`info-hint-body ${bulleted ? "bulleted" : ""}`}>
        {notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </span>
    </span>
  );
}
