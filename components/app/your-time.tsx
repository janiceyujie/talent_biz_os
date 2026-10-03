"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { exactInstant, wallTimeToUtc } from "@/lib/domain/dates";

// Items keep their own local time and zone ("21:00 · Asia/Tokyo"). When that
// zone differs from the viewer's, a second line gives the same moment in the
// viewer's zone. The viewer's zone is the browser's, so it's only known after
// hydration; the server renders without the line.

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useViewerZone(): string | null {
  return useSyncExternalStore(noSubscribe, browserZone, () => null);
}

function wallTime(instant: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "Your time: 02:55 · Asia/Taipei", only for a timed item whose local time differs from the viewer's. */
export function YourTime({ date, time, timeZone }: { date: string; time: string; timeZone: string }) {
  const t = useTranslations("timeZone");
  const viewer = useViewerZone();
  if (!viewer || !time || viewer === timeZone) return null;
  const instant = exactInstant(date, time, timeZone) ?? wallTimeToUtc(date, time, timeZone).getTime();
  const local = wallTime(instant, viewer);
  if (local.date === date && local.time === time) return null; // same clock (e.g. Asia/Shanghai vs Asia/Taipei)
  const when = `${local.date === date ? "" : `${local.date} `}${local.time} · ${viewer}`;
  return <small className="your-time">{t("yourTime", { when })}</small>;
}
