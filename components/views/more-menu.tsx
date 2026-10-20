"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** The visible box of the nearest ancestor that clips what overflows it (a pane that scrolls), else the window. */
function visibleBox(el: HTMLElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY === "visible") continue;
    const box = node.getBoundingClientRect();
    return { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, window.innerHeight), left: Math.max(box.left, 0) };
  }
  return { top: 0, bottom: window.innerHeight, left: 0 };
}

/**
 * A button and its menu: by default ⋯ with less frequent actions; `button` and `className` give it
 * other content (e.g. the closing-check chip). Escape or a click elsewhere closes it. It opens
 * upward when below there's no room, and from the button's left edge when there's none to the left,
 * where a scrolling pane or the window would cut it off.
 */
export function MoreMenu({
  label,
  button,
  className = "secondary icon-button",
  heading,
  children,
}: {
  label: string;
  button?: ReactNode;
  className?: string;
  heading?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ above: false, start: false });
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    const button = root.current!.getBoundingClientRect();
    const box = visibleBox(root.current!);
    setPlace({
      above: button.bottom + 4 + el.offsetHeight > box.bottom && button.top - 4 - el.offsetHeight >= box.top,
      start: button.right - el.offsetWidth < box.left, // ending at the button's right edge would run past the left
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="more-menu" ref={root} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button className={className} aria-label={button ? undefined : label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {button ?? <Ellipsis size={18} aria-hidden="true" />}
      </button>
      {open && (
        <div ref={list} className={`more-menu-list${place.above ? " is-above" : ""}${place.start ? " is-start" : ""}`} role="menu" aria-label={label} onClick={() => setOpen(false)}>
          {heading && <p className="more-menu-heading">{heading}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
