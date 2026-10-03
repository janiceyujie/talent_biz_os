"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { createCalendarFeed, disableCalendarFeed } from "@/lib/actions/calendar-feed";

/** Create, reset, or turn off the private calendar subscription link. */
export function CalendarFeedSettings() {
  const data = useAppData();
  const t = useTranslations("calendarFeed");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createCalendarFeed();
      if ("error" in result) return setError(result.error);
      setError(null);
      setCopied(false);
      setUrl(result.url);
    });

  return (
    <section className="surface padded">
      <div className="section-header">
        <div>
          <span>Calendar</span>
          <h2>{t("title")}</h2>
        </div>
        <span className="mock-chip">{data.calendarFeed ? t("on") : t("off")}</span>
      </div>
      <p>
        {t("intro")}
      </p>
      {url && (
        <div className="notice">
          <p>
            <strong>{t("copyNow")}</strong> {t("copyNowDetail")}
          </p>
          <input aria-label={t("linkLabel")} readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="row-actions">
            <button
              className="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? t("copied") : t("copy")}
            </button>
            {/* Apple Calendar fetches webcal:// over HTTPS, so the shortcut only works once the app is on HTTPS. */}
            {url.startsWith("https:") && (
              <a className="secondary" href={url.replace(/^https:/, "webcal:")}>
                {t("openApple")}
              </a>
            )}
          </div>
          {!url.startsWith("https:") && (
            <p className="muted">
              {t("localHint")}
            </p>
          )}
          <p className="muted">
            {t("googleHint")}
          </p>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button className="primary" disabled={pending} onClick={create}>
          {data.calendarFeed ? t("reset") : t("create")}
        </button>
        {data.calendarFeed && (
          <button
            className="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setUrl(null);
                setError(await disableCalendarFeed());
              })
            }
          >
            {t("disable")}
          </button>
        )}
      </div>
      {data.calendarFeed && !url && <p className="muted">{t("resetNote")}</p>}
    </section>
  );
}
