"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const PHONE = "(max-width: 900px)"; // where the two panes stack (experience.css)
const BOTTOM_GAP = 24; // px left below the panes
const MIN_HEIGHT = 420; // px; a shorter window scrolls the page instead

/**
 * Intake's list and the open message. Side by side on a wide screen, each scrolling on its own, so
 * reading a long message never moves the list. On a phone one at a time: picking a message opens it
 * in full, and Back to messages returns to the list where it was, focus on the message picked.
 */
export function InboxReaderLayout({
  selectedId,
  listLabel,
  list,
  startReading = false,
  openId = "",
  children,
}: {
  selectedId: string;
  listLabel: string;
  list: ReactNode;
  startReading?: boolean; // opened on a message (?message= from a project timeline)
  openId?: string; // set to a message just added (pasted, uploaded): a phone opens it
  children: ReactNode;
}) {
  const t = useTranslations("inbox");
  const [reading, setReading] = useState(startReading);
  const root = useRef<HTMLDivElement>(null);
  const listPane = useRef<HTMLElement>(null);
  const readerPane = useRef<HTMLElement>(null);
  const picked = useRef<HTMLElement | null>(null); // the list entry last opened
  const listScroll = useRef(0); // the page's scroll on a phone when it was opened
  // A new openId opens it, as a click on it would (set during render, React's way to follow a prop).
  const [lastOpenId, setLastOpenId] = useState(openId);
  if (openId !== lastOpenId) {
    setLastOpenId(openId);
    if (openId) setReading(true);
  }

  // Side by side, the panes reach down to the window's bottom edge, so each scrolls inside the window.
  // Measured, since what sits above them (a notice, the tabs) changes.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--inbox-panes-height", `${Math.max(MIN_HEIGHT, window.innerHeight - top - BOTTOM_GAP)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // A new message starts at its top.
  useLayoutEffect(() => {
    readerPane.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  // On a phone, opening a message takes the page to it; going back returns to the list as it was.
  const wasReading = useRef(reading);
  useLayoutEffect(() => {
    if (wasReading.current === reading || !window.matchMedia(PHONE).matches) {
      wasReading.current = reading;
      return;
    }
    wasReading.current = reading;
    if (reading) {
      readerPane.current?.scrollIntoView({ block: "start" });
      readerPane.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: listScroll.current });
      (picked.current?.isConnected ? picked.current : listPane.current)?.focus({ preventScroll: true });
    }
  }, [reading]);

  return (
    <div ref={root} className={`inbox-layout inbox-panes section-gap${reading ? " is-reading" : ""}`}>
      <section
        ref={listPane}
        className="surface padded inbox-messages"
        aria-label={listLabel}
        tabIndex={-1}
        onClickCapture={(e) => {
          const entry = (e.target as HTMLElement).closest<HTMLElement>(".mail-summary, .history-row");
          if (!entry) return;
          picked.current = entry;
          listScroll.current = window.scrollY;
          setReading(true);
        }}
      >
        {list}
      </section>
      <section ref={readerPane} className="surface padded inbox-reader" aria-label={t("readerLabel")}>
        <button className="secondary inbox-back" onClick={() => setReading(false)}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToList")}
        </button>
        {children}
      </section>
    </div>
  );
}
