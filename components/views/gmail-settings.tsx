"use client";

// Settings → Connected services → Gmail (decision 0013). Connecting is a round
// trip through Google's consent screen (app/api/mail/connect); Google sends the
// person back here with ?gmail=<result>. Disconnecting is finished by the worker.
import { Mail, Unlink } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { Modal } from "@/components/app/modal";
import { disconnectGmail, removeSenderRule } from "@/lib/actions/mail";
import type { HistoryMode } from "@/lib/mail/history";
import { SettingsRow } from "./settings-row";

const results = ["draftNotGranted", "connected", "notConfigured", "expired", "cancelled", "notGranted", "noOffline", "otherAccount", "disconnecting", "googleError"] as const;
type Result = (typeof results)[number];
const POLL_MS = 3000; // while disconnecting, look again this often until the row is gone
const SLOW_MS = 60_000; // a disconnect normally takes seconds; past this, say so

export function GmailSettings({ onNotice }: { onNotice: (text: string) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Back from Google with a failure: shown on the row until the next action here.
  const returned = params.get("gmail");
  const [failed, setFailed] = useState<string | null>(() =>
    returned && returned !== "connected" && results.includes(returned as Result) ? t(`result.${returned as Exclude<Result, "connected">}`) : null,
  );
  const [dialog, setDialog] = useState<"connect" | "manage" | "disconnect" | null>(null);
  const [keep, setKeep] = useState<"filed" | "none">("filed"); // the gentler choice by default
  const connection = gmail.connection;

  // Back from Google: confirm success, once, and tidy the address.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !returned) return;
    handled.current = true;
    router.replace("/settings", { scroll: false });
    if (returned === "connected") onNotice(t("result.connected"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [returned]);

  // The worker finishes a disconnect within moments: look again until the row is gone, and say so
  // if it's taking long (the worker is down; locally, usually not started: see docs/setup/gmail.md).
  const disconnecting = connection?.status === "disconnecting";
  const now = useNow({ updateInterval: disconnecting ? POLL_MS : 60_000 });
  const slow = disconnecting && now.getTime() - new Date(connection.updatedAt).getTime() > SLOW_MS;
  useEffect(() => {
    if (!disconnecting) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [disconnecting, router]);

  const rowError =
    failed ?? (connection?.status === "reconnect_needed" ? t("reconnectNeededShort") : connection?.status === "error" ? t("errorShort") : null);
  const description = !gmail.available
    ? t("notConfigured")
    : !connection
      ? t("notConnected")
      : disconnecting
        ? slow
          ? t("disconnectingSlow")
          : t("disconnecting")
        : rowError
          ? connection.accountEmail
          : (
              <>
                <span className="status-dot" aria-hidden="true" />
                {t("connectedAs", { email: connection.accountEmail })}
              </>
            );

  return (
    <>
      <SettingsRow icon={<Mail size={20} />} label={t("title")} hintBulleted hint={[t("aboutRead"), t("aboutDecide"), t("aboutMembers")]} description={description} error={rowError}>
        {gmail.available && (!connection || connection.status === "reconnect_needed") && (
          <button className="primary" onClick={() => setDialog("connect")}>
            {connection ? t("reconnect") : t("connect")}
          </button>
        )}
        {connection && !disconnecting && connection.status !== "reconnect_needed" && (
          <button className="secondary" onClick={() => setDialog("manage")}>
            {t("manage")}
          </button>
        )}
        {connection?.status === "reconnect_needed" && (
          <button className="text-button" onClick={() => setDialog("disconnect")}>
            {t("disconnect")}
          </button>
        )}
      </SettingsRow>

      {dialog === "connect" && <ConnectDialog reconnect={!!connection} defaultMode={connection?.historyMode ?? "30_days"} onClose={() => setDialog(null)} />}

      {dialog === "manage" && connection && (
        <Modal title={t("title")} onClose={() => setDialog(null)}>
          <dl className="calendar-flows">
            <dt>{t("account")}</dt>
            <dd>{connection.accountEmail}</dd>
            <dt>{t("since")}</dt>
            <dd>{format.dateTime(new Date(connection.connectedAt), { dateStyle: "medium" })}</dd>
            <dt>{t("historyLabel")}</dt>
            <dd>{connection.historyMode === "new_only" ? t("historyNew") : t("history30")}</dd>
            <dt>{t("lastSynced")}</dt>
            <dd>{connection.lastSyncedAt ? format.dateTime(new Date(connection.lastSyncedAt), { dateStyle: "medium", timeStyle: "short" }) : t("never")}</dd>
          </dl>
          <SenderRules onNotice={onNotice} />
          <p className={connection.status === "error" ? "notice error" : "muted"} role="status">
            {connection.status === "error" ? t("errorLong") : t("notReadingYet")}
          </p>
          <footer className="modal-actions">
            <button className="secondary danger-outline" onClick={() => setDialog("disconnect")}>
              <Unlink size={16} aria-hidden="true" />
              {t("disconnect")}
            </button>
            <button className="primary" onClick={() => setDialog(null)}>
              {t("done")}
            </button>
          </footer>
        </Modal>
      )}

      {dialog === "disconnect" && (
        <Modal narrow title={t("disconnectTitle")} onClose={() => setDialog(null)}>
          <p>{t("disconnectBody")}</p>
          <fieldset className="gmail-history">
            <legend>{t("keepTitle")}</legend>
            {(["filed", "none"] as const).map((k) => (
              <label key={k} className="gmail-option">
                <input type="radio" name="gmail-keep" value={k} checked={keep === k} onChange={() => setKeep(k)} />
                <strong>{k === "filed" ? t("keepFiled") : t("keepNone")}</strong>
                <small>{k === "filed" ? t("keepFiledHint") : t("keepNoneHint")}</small>
              </label>
            ))}
          </fieldset>
          <footer className="modal-actions">
            <button className="secondary" onClick={() => setDialog(null)}>
              {t("cancel")}
            </button>
            <button
              className="primary danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const failure = await disconnectGmail(keep);
                  setFailed(failure);
                  setDialog(null);
                })
              }
            >
              {t("confirmDisconnect")}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}

/** The artist's own "always" and "never", each removable. They're made from Waiting and Filtered out in Intake. */
function SenderRules({ onNotice }: { onNotice: (text: string) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const [pending, startTransition] = useTransition();
  return (
    <section className="gmail-rules" aria-labelledby="gmail-rules-title">
      <h3 id="gmail-rules-title">{t("senderRules")}</h3>
      {gmail.senderRules.length ? (
        <ul>
          {gmail.senderRules.map((r) => (
            <li key={r.id}>
              <span>{r.kind === "domain" ? t("scopeDomain", { domain: r.value }) : r.value}</span>
              <em className={r.verdict === "always" ? "message-status status-confirmed" : "message-status"}>
                {r.verdict === "always" ? t("ruleAlways") : t("ruleNever")}
              </em>
              <button
                className="text-button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const failure = await removeSenderRule(r.id);
                    if (failure) onNotice(failure);
                  })
                }
              >
                {t("removeRule")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("noRules")}</p>
      )}
    </section>
  );
}

/** What connecting means in one line (details behind ⓘ), the history choice, then off to Google (a full page load, not a fetch). */
function ConnectDialog({ reconnect, defaultMode, onClose }: { reconnect: boolean; defaultMode: HistoryMode; onClose: () => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const [mode, setMode] = useState<HistoryMode>(defaultMode);
  const [drafts, setDrafts] = useState(gmail.connection?.draftGranted ?? false);
  const options: { value: HistoryMode; label: string; hint: string; recommended?: boolean }[] = [
    { value: "30_days", label: t("history30"), hint: t("history30Hint"), recommended: true },
    { value: "new_only", label: t("historyNew"), hint: t("historyNewHint") },
  ];
  return (
    <Modal narrow title={reconnect ? t("reconnectTitle") : t("connectTitle")} onClose={onClose}>
      <p className="gmail-connect-summary">
        {t("connectSummary")}
        <InfoHint bulleted notes={[t("aboutRead"), t("aboutDecide"), t("aboutMembers")]} />
      </p>
      {!reconnect && (
        <fieldset className="gmail-history">
          <legend>{t("historyTitle")}</legend>
          {options.map((o) => (
            <label key={o.value} className="gmail-option">
              <input type="radio" name="gmail-history" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} />
              <strong>{o.label}</strong>
              {o.recommended && <em>{t("recommended")}</em>}
              <small>{o.hint}</small>
            </label>
          ))}
        </fieldset>
      )}
      {gmail.freeTier && <p className="notice gmail-free-tier">{t("freeTierNotice")}</p>}
      <label className="invoice-check"><input type="checkbox" checked={drafts} onChange={e=>setDrafts(e.target.checked)} />{t("draftAccess")}</label>
      {drafts && <p className="notice">{t("draftDisclosure")}</p>}
      <p className="gmail-account-note">{t("accountNote")}</p>
      <footer className="modal-actions">
        <button className="secondary" onClick={onClose}>
          {t("cancel")}
        </button>
        <a className="primary" href={`/api/mail/connect?history=${mode}${drafts ? "&drafts=1" : ""}`}>
          {t("continue")}
        </a>
      </footer>
    </Modal>
  );
}
