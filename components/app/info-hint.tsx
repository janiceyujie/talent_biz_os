"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { placeHint } from "@/lib/domain/hint-placement";

/** Shared help stays in the native top layer, including inside scrolling popovers and dialogs. */
export function InfoHint({ notes, label, above = false, bulleted = false }: { notes: string[]; label?: string; above?: boolean; bulleted?: boolean }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = !dismissed && (open || hovered || focused);
  const hide = () => { setOpen(false); setHovered(false); setFocused(false); setDismissed(true); };

  useLayoutEffect(() => {
    const el = body.current, anchor = button.current;
    if (!el || !anchor || !shown) return;
    // Keeping the tooltip in its DOM parent preserves theme, dialog focus handling and hover ancestry.
    // The native top layer escapes overflow clipping; increasing z-index alone cannot do this.
    const native = typeof el.showPopover === "function";
    if (native) el.showPopover();
    else el.setAttribute("data-fallback-open", "true");
    const position = () => {
      if (!anchor.getClientRects().length) { hide(); return; }
      const viewport = window.visualViewport;
      const bounds = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? document.documentElement.clientWidth, height: viewport?.height ?? window.innerHeight };
      const rect = anchor.getBoundingClientRect();
      const container = anchor.closest("[popover], dialog");
      // Match a parent menu's inner width while still escaping its vertical clipping.
      if (container) {
        const parent = container.getBoundingClientRect();
        const right = Math.min(bounds.left + bounds.width, parent.right);
        bounds.left = Math.max(bounds.left, parent.left);
        bounds.width = Math.max(1, right - bounds.left);
        if (rect.bottom <= parent.top || rect.top >= parent.bottom) { hide(); return; }
      }
      if (rect.bottom < bounds.top || rect.top > bounds.top + bounds.height) { hide(); return; }
      el.style.maxWidth = `${Math.max(1, Math.min(360, bounds.width - 32))}px`;
      el.style.maxHeight = `${Math.max(1, bounds.height - 32)}px`;
      const measured = el.getBoundingClientRect();
      const placement = placeHint(rect, { width: measured.width, height: measured.height }, bounds, above);
      el.style.left = `${placement.left}px`;
      el.style.top = `${placement.top}px`;
      el.style.maxHeight = `${placement.maxHeight}px`;
    };
    const parents: Element[] = [];
    for (let parent = ref.current?.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches("[popover], dialog")) parents.push(parent);
    }
    const parentToggle = (event: Event) => { if ((event as ToggleEvent).newState === "closed") hide(); };
    parents.forEach(parent => parent.addEventListener("beforetoggle", parentToggle));
    position();
    const observer = new ResizeObserver(position);
    observer.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      if (native && el.matches(":popover-open")) el.hidePopover();
      el.removeAttribute("data-fallback-open");
      observer.disconnect();
      parents.forEach(parent => parent.removeEventListener("beforetoggle", parentToggle));
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [shown, above, notes]);

  useEffect(() => {
    if (!shown) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) hide(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); hide(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [shown]);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  return (
    <span ref={ref} className={`info-hint ${shown ? "is-open" : ""}`}
      onMouseEnter={() => { if (leaveTimer.current) clearTimeout(leaveTimer.current); setHovered(true); setDismissed(false); }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 120); }}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setOpen(false); } }}>
      <button ref={button} type="button" className="info-hint-button"
        aria-label={label ? `${label}: ${t("about")}` : t("about")}
        aria-expanded={shown} aria-describedby={shown ? id : undefined}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && body.current && body.current.scrollHeight > body.current.clientHeight) {
            event.preventDefault(); body.current.focus();
          }
        }}
        onClick={() => { setOpen(!open); setDismissed(open); }}>
        <Info size={16} aria-hidden="true" />
      </button>
      <span ref={body} popover="manual" role="tooltip" tabIndex={-1} id={id}
        onClick={event => { event.preventDefault(); event.stopPropagation(); }} className={`info-hint-body ${bulleted ? "bulleted" : ""}`}>
        {notes.map(note => <span key={note}>{note}</span>)}
      </span>
    </span>
  );
}
