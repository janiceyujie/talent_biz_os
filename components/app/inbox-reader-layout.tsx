"use client";

import { ArrowLeft } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Keep the queue mounted while reading so paging, filters and scroll position survive Back. */
export function InboxReaderLayout({ reading, title, listLabel, list, children, onBack }: {
  reading: boolean; title: string; listLabel: string; list: ReactNode; children: ReactNode; onBack: () => void;
}) {
  const t = useTranslations("inbox");
  const root = useRef<HTMLDivElement>(null);
  const queue = useRef<HTMLElement>(null);
  const reader = useRef<HTMLElement>(null);
  const position = useRef(0);
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const wasReading = useRef(false);
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
  }, [reading]);
  useLayoutEffect(() => {
    if (reading) {
      reader.current?.scrollTo({ top: 0 });
      reader.current?.focus({ preventScroll: true });
    } else if (wasReading.current) {
      if (queue.current) queue.current.scrollTop = position.current;
      (lastButton.current?.isConnected ? lastButton.current : queue.current)?.focus({ preventScroll: true });
    }
    wasReading.current = reading;
  }, [reading]);
  return <div ref={root} className={`inbox-layout inbox-focus-layout section-gap${reading ? " is-reading" : ""}`}>
    <section ref={queue} hidden={reading} className="surface padded inbox-messages" aria-label={listLabel} tabIndex={0}
      onScroll={event => { if (!reading) position.current = event.currentTarget.scrollTop; }}
      onClickCapture={event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".mail-summary"); if (button) lastButton.current = button; }}>
      {list}
    </section>
    {reading && <>
      <aside className="surface padded inbox-selection">
        <button type="button" data-preview-safe="true" className="secondary inbox-return" onClick={onBack}><ArrowLeft size={18} aria-hidden="true"/>{t("backToList")}</button>
        <p>{title}</p>
      </aside>
      <section ref={reader} className="surface padded inbox-reader" aria-label={t("readerLabel")} tabIndex={-1}>{children}</section>
    </>}
  </div>;
}
