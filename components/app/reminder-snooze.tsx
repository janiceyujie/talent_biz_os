"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { snoozeNotification } from "@/lib/actions/notifications";
import { dateInZone, exactInstant } from "@/lib/domain/dates";
import type { StatefulNotification } from "@/lib/domain/notifications";
import { DateTimeInput } from "./date-time-input";
import { useReminderFeed } from "./reminder-feed";

export function ReminderSnooze({ n }: { n: StatefulNotification }) {
  const t = useTranslations("briefing"), locale = useLocale();
  const { reload, now, preview, talent } = useReminderFeed();
  const [expanded, setExpanded] = useState(false), [custom, setCustom] = useState(false);
  const [date, setDate] = useState(dateInZone(talent.timeZone)), [time, setTime] = useState("");
  const [error, setError] = useState(""), [pending, start] = useTransition();
  const save = (value: number | string | boolean) => start(async () => {
    setError("");
    try {
      const error = await snoozeNotification(n.id, value);
      if (error) { setError(error); return; }
      await reload(); setExpanded(false); setCustom(false);
    } catch { setError(t("error")); }
  });
  return <div className="briefing-snooze">
    {n.snoozedUntil && <small>{t("until", { time: new Intl.DateTimeFormat(locale, { timeZone: talent.timeZone, month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(n.snoozedUntil)) })}</small>}
    <button type="button" className="text-button" disabled={pending || preview} aria-expanded={expanded} onClick={() => n.snoozedUntil ? save(false) : setExpanded(!expanded)}>{t(n.snoozedUntil ? "resume" : "later")}</button>
    {expanded && <div className="briefing-snooze-options">
      <div className="briefing-actions">{[60,120,180].map(minutes => <button type="button" key={minutes} className="secondary" disabled={pending} onClick={() => save(minutes)}>{t("hours", { count: minutes / 60 })}</button>)}<button type="button" className="text-button" disabled={pending} onClick={() => setCustom(!custom)}>{t("custom")}</button></div>
      {custom && <form onSubmit={e => { e.preventDefault(); const instant = exactInstant(date, time, talent.timeZone); if (instant === null || instant <= now.getTime() || instant > now.getTime() + 30 * 86400_000) { setError(t("invalidTime")); return; } save(new Date(instant).toISOString()); }}>
        <div className="briefing-date-fields"><DateTimeInput kind="date" label={t("date")} value={date} onChange={setDate} today={dateInZone(talent.timeZone)} required/><DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={date} required/></div>
        <div className="briefing-actions"><small>{talent.timeZone}</small><button className="secondary" disabled={pending}>{t("save")}</button></div>
      </form>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
