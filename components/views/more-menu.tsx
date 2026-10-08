"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A button and its menu: by default ⋯ with less frequent actions; `button` and `className` give it
 * other content (e.g. the closing-check chip). Escape or a click elsewhere closes it.
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
  const root = useRef<HTMLDivElement>(null);
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
        <div className="more-menu-list" role="menu" aria-label={label} onClick={() => setOpen(false)}>
          {heading && <p className="more-menu-heading">{heading}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
