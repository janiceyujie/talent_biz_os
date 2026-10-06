"use client";

import { Link2, Lock, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { Modal } from "@/components/app/modal";
import { createCalendarFeed, disableCalendarFeed } from "@/lib/actions/calendar-feed";
import { SettingsRow } from "./settings-row";

// What the dialog shows: the new link (once), the actions on an active link,
// or a confirmation before one of them.
type View = { kind: "reveal"; url: string } | { kind: "manage" } | { kind: "confirm"; action: "replace" | "disable" };

/**
 * The private calendar subscription link, for calendar apps other than Google
 * (which connects directly). Only its hash is stored, so a link is shown once,
 * when it's made; after that it can be replaced or turned off, each confirmed
 * first since calendars using it stop updating.
 */
export function CalendarFeedSettings() {
  const data = useAppData();
  const t = useTranslations("calendarFeed");
  const tCommon = useTranslations("common");
  const [view, setView] = useState<View | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => {
    setView(null);
    setError(null);
  };

  const create = () =>
    startTransition(async () => {
      const result = await createCalendarFeed();
      if ("error" in result) return setError(result.error);
      setError(null);
      setCopied(false);
      setView({ kind: "reveal", url: result.url });
    });
  const disable = () =>
    startTransition(async () => {
      const failure = await disableCalendarFeed();
      if (failure) setError(failure);
      else close();
    });

  const title =
    view?.kind === "reveal"
      ? t("revealTitle")
      : view?.kind === "confirm"
        ? t(view.action === "replace" ? "confirmReplaceTitle" : "confirmDisableTitle")
        : t("title");

  return (
    <>
      <SettingsRow icon={<Link2 size={20} />} label={t("title")} description={t("rowDescription")} hint={[t("intro")]} error={view ? null : error}>
        <span className="mock-chip">{data.calendarFeed ? t("on") : t("off")}</span>
        {data.calendarFeed ? (
          <button className="secondary" onClick={() => setView({ kind: "manage" })}>
            {t("manage")}
          </button>
        ) : (
          <button className="secondary" disabled={pending} onClick={create}>
            {t("create")}
          </button>
        )}
      </SettingsRow>
      {view && (
        <Modal title={title} onClose={close}>
          {view.kind === "reveal" && (
            <>
              <p>{t("copyNow")}</p>
              <div className="feed-link">
                <input aria-label={t("linkLabel")} readOnly value={view.url} onFocus={(e) => e.target.select()} />
                <button
                  className="primary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(view.url);
                    setCopied(true);
                  }}
                >
                  {copied ? t("copied") : t("copy")}
                </button>
              </div>
              <div className="feed-add">
                <span>{t("addTo")}</span>
                {/* Apple Calendar fetches webcal:// over HTTPS, so the shortcut only works once the app is on HTTPS. */}
                {view.url.startsWith("https:") && (
                  <a className="secondary" href={view.url.replace(/^https:/, "webcal:")}>
                    {t("openApple")}
                  </a>
                )}
                <span className="feed-other">
                  {t("otherApps")}
                  <InfoHint notes={[t("howTo"), ...(view.url.startsWith("https:") ? [] : [t("localHint")])]} />
                </span>
              </div>
              <p className="muted feed-warning">
                <Lock size={14} aria-hidden="true" />
                {t("shareWarning")}
              </p>
            </>
          )}
          {view.kind === "manage" && (
            <>
              <p>{t("activeBody")}</p>
              <p className="muted">{t("shownOnce")}</p>
              {/* Each action beside what it does; both ask before acting. */}
              <div className="feed-actions">
                <div>
                  <strong>{t("replaceTitle")}</strong>
                  <small>{t("replaceBody")}</small>
                </div>
                <button className="secondary" onClick={() => setView({ kind: "confirm", action: "replace" })}>
                  {t("replace")}
                </button>
                <div>
                  <strong>{t("disableTitle")}</strong>
                  <small>{t("disableBody")}</small>
                </div>
                <button className="secondary danger-outline" onClick={() => setView({ kind: "confirm", action: "disable" })}>
                  <Trash2 size={16} aria-hidden="true" />
                  {t("disable")}
                </button>
              </div>
            </>
          )}
          {view.kind === "confirm" && <p>{t(view.action === "replace" ? "confirmReplaceBody" : "confirmDisableBody")}</p>}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            {view.kind === "confirm" ? (
              <>
                <button className="secondary" disabled={pending} onClick={() => setView({ kind: "manage" })}>
                  {tCommon("cancel")}
                </button>
                <button className={`primary ${view.action === "disable" ? "danger" : ""}`} disabled={pending} onClick={view.action === "replace" ? create : disable}>
                  {t(view.action === "replace" ? "replace" : "disable")}
                </button>
              </>
            ) : (
              <button className="primary" onClick={close}>
                {t("done")}
              </button>
            )}
          </footer>
        </Modal>
      )}
    </>
  );
}
