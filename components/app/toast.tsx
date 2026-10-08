"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

const SHOWN_MS = 8000;

/**
 * What just happened, at the bottom of the screen for a few seconds. Shown as
 * a popover so it sits in the top layer, above an open dialog and its backdrop.
 * `action` adds one button beside it (e.g. Undo), which also closes it.
 */
export function Toast({
  message,
  action,
  onClose,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const t = useTranslations("common");
  // Each new message gets its own few seconds; re-renders don't restart the timer.
  const close = useRef(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showPopover?.();
    return () => el?.hidePopover?.();
  }, []);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => close.current(), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <div ref={ref} popover="manual" className="app-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {action && (
        <button
          className="text-button"
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.label}
        </button>
      )}
      <button className="icon-button" aria-label={t("close")} onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
