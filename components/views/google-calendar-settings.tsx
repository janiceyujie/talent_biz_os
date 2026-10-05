"use client";

// 設定 → Google 日曆同步 (decision 0009, phase 1). Connecting asks Google for one
// more permission on the linked Google account; coming back finishes the
// connection, and the first sync runs in the background.
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  listGoogleCalendars,
  saveGoogleCalendarChoice,
  syncGoogleCalendarNow,
  type GoogleCalendarChoice,
} from "@/lib/actions/google-calendar";
import { authClient } from "@/lib/auth/client";
import { CALENDAR_SCOPE, IMPORT_SCOPES } from "@/lib/calendar/google/scope";

export function GoogleCalendarSettings() {
  const data = useAppData();
  const t = useTranslations("googleCalendar");
  const tEyebrow = useTranslations("eyebrow");
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(true);
  const { granted, connection, importGranted, importing } = data.googleCalendar;
  const [choosing, setChoosing] = useState<GoogleCalendarChoice[] | null>(null);
  const googleLinked = !!data.signIn.googleAccountId;
  const run = (action: () => Promise<string | null>, done?: string) =>
    startTransition(async () => {
      const failure = await action();
      setMessage(failure ? { text: failure, error: true } : done ? { text: done, error: false } : null);
    });

  // Back from Google's consent screen (or granted without a connection yet): finish connecting, once.
  const finishing = useRef(false);
  const returned = params.get("calendar") === "connected";
  useEffect(() => {
    if (finishing.current || !(returned || (granted && !connection))) return;
    finishing.current = true;
    if (returned) router.replace("/settings", { scroll: false });
    run(() => connectGoogleCalendar());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [returned, granted, connection]);

  const openChooser = () =>
    startTransition(async () => {
      const result = await listGoogleCalendars();
      if ("error" in result) setMessage({ text: result.error, error: true });
      else setChoosing(result.calendars);
    });
  const askToRead = () =>
    startTransition(async () => {
      await authClient.linkSocial({
        provider: "google",
        scopes: [CALENDAR_SCOPE, ...IMPORT_SCOPES],
        callbackURL: "/settings?calendar=import",
        errorCallbackURL: "/settings",
        additionalParams: { access_type: "offline", prompt: "select_account consent" },
      });
    });

  // Back from granting read access: show the calendars to choose from, once.
  const choosingOnce = useRef(false);
  const returnedForImport = params.get("calendar") === "import";
  useEffect(() => {
    if (choosingOnce.current || !returnedForImport || !importGranted) return;
    choosingOnce.current = true;
    router.replace("/settings", { scroll: false });
    openChooser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [returnedForImport, importGranted]);

  // The first sync runs after the page responds: look again until it has synced or failed.
  const waiting = !!connection && connection.status === "connected" && !connection.lastSyncedAt && !connection.lastError;
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = setInterval(() => (++tries > 30 ? clearInterval(timer) : router.refresh()), 2000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const connect = () =>
    startTransition(async () => {
      await authClient.linkSocial({
        provider: "google",
        scopes: [CALENDAR_SCOPE],
        callbackURL: "/settings?calendar=connected",
        errorCallbackURL: "/settings",
        // A refresh token, so syncing works without the person present.
        additionalParams: { access_type: "offline", prompt: "select_account consent" },
      });
    });

  const status = !connection
    ? null
    : connection.status === "needs_reconnect"
      ? { text: t("needsReconnect"), error: true }
      : connection.lastError
        ? { text: t(`error.${connection.lastError as "google" | "network" | "auth"}`), error: true }
        : connection.lastSyncedAt
          ? { text: t("connected", { when: format.dateTime(new Date(connection.lastSyncedAt), { dateStyle: "medium", timeStyle: "short" }) }), error: false }
          : { text: t("pending"), error: false };

  return (
    <section className="surface padded google-calendar-card">
      <div className="section-header">
        <div>
          <span>{tEyebrow("google")}</span>
          <h2>{t("title")}</h2>
        </div>
      </div>
      {/* What the app can do depends on what Google was asked for: say exactly that. */}
      <p>{importGranted ? t("bodyWithRead") : t("body")}</p>
      <p className="muted">{t("shared")}</p>
      {!data.googleCalendar.available ? (
        <p className="muted">{t("notConfigured")}</p>
      ) : !googleLinked ? (
        <p className="muted">{t("needGoogle")}</p>
      ) : (
        <>
          {status && (
            <p className={status.error ? "notice error" : "muted"} role={status.error ? "alert" : "status"}>
              {status.text}
            </p>
          )}
          <div className="row-actions">
            {!connection || connection.status === "needs_reconnect" ? (
              <button className="primary" disabled={pending} onClick={connect}>
                {pending && granted ? t("connecting") : connection ? t("reconnect") : t("connect")}
              </button>
            ) : (
              <button className="secondary" disabled={pending} onClick={() => run(() => syncGoogleCalendarNow(), t("syncQueued"))}>
                {pending ? t("syncing") : t("syncNow")}
              </button>
            )}
            {connection && (
              <button className="text-button" disabled={pending} onClick={() => setConfirming(true)}>
                {t("disconnect")}
              </button>
            )}
          </div>
          {connection?.status === "connected" && (
            // Phase 2: the person's own Google calendars, shown here read-only.
            <div className="google-import">
              <h3>{t("importTitle")}</h3>
              <p className="muted">{t("importBody")}</p>
              {importing.length > 0 && (
                <ul className="google-import-list">
                  {importing.map((c) => (
                    <li key={c.name}>
                      <span className="calendar-dot" style={{ background: c.color ?? "#7986cb" }} aria-hidden="true" />
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
              <button className="secondary" disabled={pending} onClick={importGranted ? openChooser : askToRead}>
                {importing.length ? t("importChange") : t("importChoose")}
              </button>
            </div>
          )}
        </>
      )}
      {choosing && <CalendarChooser calendars={choosing} onClose={() => setChoosing(null)} onSaved={(failure) => setMessage(failure ? { text: failure, error: true } : null)} />}
      {message && (
        <p className={message.error ? "notice error" : "muted"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
      {confirming && (
        <Modal title={t("disconnectTitle")} onClose={() => setConfirming(false)}>
          <p>{t("disconnectBody")}</p>
          <label className="check-line">
            <input type="checkbox" checked={deleteCalendar} onChange={(e) => setDeleteCalendar(e.target.checked)} />
            {t("deleteCalendar")}
          </label>
          <footer className="modal-actions">
            <button className="secondary" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </button>
            <button
              className="primary danger"
              onClick={() => {
                setConfirming(false);
                run(() => disconnectGoogleCalendar(deleteCalendar));
              }}
            >
              {t("confirmDisconnect")}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}

/** Which of the person's Google calendars to show here. */
function CalendarChooser({ calendars, onClose, onSaved }: { calendars: GoogleCalendarChoice[]; onClose: () => void; onSaved: (failure: string | null) => void }) {
  const t = useTranslations("googleCalendar");
  const [picked, setPicked] = useState(() => new Set(calendars.filter((c) => c.selected).map((c) => c.id)));
  const [pending, startTransition] = useTransition();
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Modal title={t("chooseTitle")} onClose={onClose}>
      <p className="muted">{t("chooseBody")}</p>
      <fieldset className="google-calendar-choices" disabled={pending}>
        {calendars.map((c) => (
          <label key={c.id} className="check-line">
            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="calendar-dot" style={{ background: c.color ?? "#7986cb" }} aria-hidden="true" />
            {c.name}
          </label>
        ))}
        {!calendars.length && <p className="muted">{t("chooseNone")}</p>}
      </fieldset>
      <footer className="modal-actions">
        <button className="secondary" onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          className="primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const failure = await saveGoogleCalendarChoice(calendars.filter((c) => picked.has(c.id)).map(({ id, name, color }) => ({ id, name, color })));
              onSaved(failure);
              if (!failure) onClose();
            })
          }
        >
          {pending ? t("saving") : t("chooseSave")}
        </button>
      </footer>
    </Modal>
  );
}
