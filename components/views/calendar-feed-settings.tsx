"use client";

import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { createCalendarFeed, disableCalendarFeed } from "@/lib/actions/calendar-feed";

/** Create, reset, or turn off the private calendar subscription link. */
export function CalendarFeedSettings() {
  const data = useAppData();
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
          <h2>行事曆訂閱</h2>
        </div>
        <span className="mock-chip">{data.calendarFeed ? "已啟用" : "未啟用"}</span>
      </div>
      <p>
        在 Google 或 Apple 行事曆加入這個私人連結後，已確認的行程會自動出現，不需要連接你的行事曆帳號。行事曆 App
        會定期更新（Google 可能需要數小時）。
      </p>
      {url && (
        <div className="notice">
          <p>
            <strong>請現在複製這個連結。</strong>為了安全，它只會顯示這一次；之後若遺失，請重設連結。
          </p>
          <input aria-label="行事曆訂閱連結" readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="row-actions">
            <button
              className="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "已複製" : "複製連結"}
            </button>
            {/* Apple Calendar fetches webcal:// over HTTPS, so the shortcut only works once the app is on HTTPS. */}
            {url.startsWith("https:") && (
              <a className="secondary" href={url.replace(/^https:/, "webcal:")}>
                在 Apple 行事曆開啟
              </a>
            )}
          </div>
          {!url.startsWith("https:") && (
            <p className="muted">
              目前是本機開發網址（http），無法用 webcal 開啟。Apple 行事曆：選單「檔案」→「新增行事曆訂閱」，貼上上方連結。
            </p>
          )}
          <p className="muted">
            Google 行事曆：在電腦版左側「其他日曆」按＋，選「透過網址新增」，貼上連結。任何拿到連結的人都能看到你的行程，請勿公開分享。
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
          {data.calendarFeed ? "重設連結" : "建立訂閱連結"}
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
            停用訂閱
          </button>
        )}
      </div>
      {data.calendarFeed && !url && <p className="muted">重設後舊連結會立即失效。</p>}
    </section>
  );
}
