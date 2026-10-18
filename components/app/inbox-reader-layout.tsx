"use client";

import { ArrowLeft } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Browse the queue without discarding the open message or either pane's position. */
export function InboxReaderLayout({ selectedId, selectedCard, listLabel, list, children }: {
  selectedId: string; selectedCard: ReactNode; listLabel: string; list: ReactNode; children: ReactNode;
}) {
  const t = useTranslations("inbox");
  const [browsingFor, setBrowsingFor] = useState<string | null>(null);
  const focused = !!selectedId && browsingFor !== selectedId;
  const root = useRef<HTMLDivElement>(null);
  const queue = useRef<HTMLElement>(null);
  const reader = useRef<HTMLElement>(null);
  const position = useRef(0);
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const wasFocused = useRef(false);
  const previousId = useRef("");
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      element.style.setProperty("--inbox-pane-height", `${Math.max(280, window.innerHeight - top - 88)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [focused]);
  useLayoutEffect(() => {
    if (selectedId !== previousId.current) reader.current?.scrollTo({ top: 0 });
    if (focused) {
      reader.current?.focus({ preventScroll: true });
    } else if (wasFocused.current) {
      if (queue.current) queue.current.scrollTop = position.current;
      (lastButton.current?.isConnected ? lastButton.current : queue.current)?.focus({ preventScroll: true });
    }
    previousId.current = selectedId;
    wasFocused.current = focused;
  }, [focused, selectedId]);
  return <div ref={root} className={`inbox-layout inbox-focus-layout section-gap${focused ? " is-reading" : ""}`}>
    <section ref={queue} hidden={focused} className="surface padded inbox-messages" aria-label={listLabel} tabIndex={0}
      onScroll={event => { if (!focused) position.current = event.currentTarget.scrollTop; }}
      onClickCapture={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".mail-summary");
        if (button) {
          lastButton.current = button;
          position.current = queue.current?.scrollTop ?? 0;
          setBrowsingFor(null);
        }
      }}>
      {list}
    </section>
    {focused && <aside className="surface padded inbox-selection" aria-label={listLabel}>
      <button type="button" data-preview-safe="true" className="secondary inbox-return" onClick={() => setBrowsingFor(selectedId)}><ArrowLeft size={18} aria-hidden="true"/>{t("backToList")}</button>
      {selectedCard}
    </aside>}
    <section ref={reader} className="surface padded inbox-reader" aria-label={t("readerLabel")} tabIndex={-1}>{children}</section>
  </div>;
}
