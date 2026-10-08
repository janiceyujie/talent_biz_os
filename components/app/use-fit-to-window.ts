"use client";

import { useEffect, type RefObject } from "react";

/**
 * A list panel beside a detail (Projects, Partner history): sets `--list-top` on it to where it starts
 * on screen, so its CSS can end it at the window's bottom (`max-height: calc(100vh - var(--list-top) -
 * …)`). It starts lower while the page header is in view and under the top bar once it sticks, so
 * every row is reached by scrolling the list alone and the detail beside it stays put. Measured again
 * on scroll, and when what's above it changes height (counts, a banner), which moves it without one.
 */
export function useFitToWindow(panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--list-top", `${Math.max(0, el.getBoundingClientRect().top)}px`);
    fit();
    const resized = new ResizeObserver(fit);
    resized.observe(document.body);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      resized.disconnect();
      window.removeEventListener("scroll", fit);
    };
  }, [panel]);
}
