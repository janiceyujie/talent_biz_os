"use client";

// 設定 → 連結的服務 → Google 日曆 (decision 0009). Connecting asks Google for one
// more permission on the linked Google account; coming back finishes the
// connection, and the first sync runs in the background.
import { CalendarDays, Unlink } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
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
import { SettingsRow } from "./settings-row";

// Google's own default calendar colour, for a calendar that reports none.
const DEFAULT_GOOGLE_COLOR = "#7986cb";
const MINUTE_MS = 60_000; // how often "n minutes ago" updates

/** 設定 → 連結的服務 → Google 日曆: one row (status, connect or 管理), the details in a dialog. */
export function GoogleCalendarSettings({ onNotice }: { onNotice: (text: string) => void }) {
  const data = useAppData();
  const t = useTranslations("googleCalendar");
  const format = useFormatter();
  const now = useNow({ updateInterval: MINUTE_MS });
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null); // what the last action here couldn't do
  const [confirming, setConfirming] = useState(false);
  const [managing, setManaging] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(true);
  const { granted, connection, importGranted, importing } = data.googleCalendar;
  const [choosing, setChoosing] = useState<GoogleCalendarChoice[] | null>(null);
  const googleLinked = !!data.signIn.googleAccountId;
  const run = (action: () => Promise<string | null>, done?: string) =>
    startTransition(async () => {
      const failure = await action();
      setFailed(failure);
      if (!failure && done) onNotice(done);
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
      setManaging(false);
      const result = await listGoogleCalendars();
      if ("error" in result) setFailed(result.error);
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

  // The row says where things stand in a few words; the dialog has the full sentence.
  const syncProblem =
    connection?.status === "needs_reconnect"
      ? t("needsReconnect")
      : connection?.lastError
        ? t(`error.${connection.lastError as "google" | "network" | "auth"}`)
        : null;
  const rowError =
    failed ?? (connection?.status === "needs_reconnect" ? t("needsReconnectShort") : connection?.lastError ? t("syncFailed") : null);
  const rowStatus = !data.googleCalendar.available ? (
    t("notConfigured")
  ) : !googleLinked ? (
    t("needGoogle")
  ) : !connection ? (
    t("notConnected")
  ) : rowError ? null : connection.lastSyncedAt ? (
    <>
      <span className="status-dot" aria-hidden="true" />
      {/* Under a minute (or "in 2 seconds", when this device's clock runs a little behind the server's) reads as just now. */}
      {now.getTime() - new Date(connection.lastSyncedAt).getTime() < MINUTE_MS
        ? t("syncedJustNow")
        : t("syncedAgo", { when: format.relativeTime(new Date(connection.lastSyncedAt), now) })}
    </>
  ) : (
    t("pending")
  );
  const usable = data.googleCalendar.available && googleLinked;

  return (
    <>
      <SettingsRow
        icon={<CalendarDays size={20} />}
        label={t("title")}
        hint={[t("aboutSend"), t("aboutShow")]}
        description={rowStatus}
        error={rowError}
      >
        {usable && (!connection || connection.status === "needs_reconnect") && (
          <button className="primary" disabled={pending} onClick={connect}>
            {pending && granted ? t("connecting") : connection ? t("reconnect") : t("connect")}
          </button>
        )}
        {usable && connection?.status === "needs_reconnect" && (
          <button className="text-button" disabled={pending} onClick={() => setConfirming(true)}>
            {t("disconnect")}
          </button>
        )}
        {usable && connection?.status === "connected" && (
          <button className="secondary" onClick={() => setManaging(true)}>
            {t("manage")}
          </button>
        )}
      </SettingsRow>
      {managing && connection && (
        <Modal title={t("title")} onClose={() => setManaging(false)}>
          <p className={syncProblem ? "notice error" : "muted"} role={syncProblem ? "alert" : "status"}>
            {syncProblem ??
              (connection.lastSyncedAt
                ? t("connected", { when: format.dateTime(new Date(connection.lastSyncedAt), { dateStyle: "medium", timeStyle: "short" }) })
                : t("pending"))}
          </p>
          {/* The two directions, named by what they do (decision 0009). */}
          <dl className="calendar-flows">
            <dt>{t("sendTitle")}</dt>
            <dd>{t("sendTo")}</dd>
            <dt>{t("importTitle")}</dt>
            <dd className="google-import">
              {importing.length > 0 ? (
                <ul className="google-import-list">
                  {importing.map((c) => (
                    <li key={c.name}>
                      <span className="calendar-dot" style={{ background: c.color ?? DEFAULT_GOOGLE_COLOR }} aria-hidden="true" />
                      {c.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">{t("importNone")}</span>
              )}
              <button className="text-button" disabled={pending} onClick={importGranted ? openChooser : askToRead}>
                {importing.length ? t("importChange") : t("importChoose")}
              </button>
            </dd>
          </dl>
          {failed && (
            <p className="notice error" role="alert">
              {failed}
            </p>
          )}
          <footer className="modal-actions">
            <button
              className="secondary danger-outline"
              onClick={() => {
                setManaging(false);
                setConfirming(true);
              }}
            >
              <Unlink size={16} aria-hidden="true" />
              {t("disconnect")}
            </button>
            <button className="secondary" disabled={pending} onClick={() => run(() => syncGoogleCalendarNow(), t("syncQueued"))}>
              {pending ? t("syncing") : t("syncNow")}
            </button>
            <button className="primary" onClick={() => setManaging(false)}>
              {t("done")}
            </button>
          </footer>
        </Modal>
      )}
      {choosing && <CalendarChooser calendars={choosing} onClose={() => setChoosing(null)} onSaved={setFailed} />}
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
    </>
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
            <span className="calendar-dot" style={{ background: c.color ?? DEFAULT_GOOGLE_COLOR }} aria-hidden="true" />
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
