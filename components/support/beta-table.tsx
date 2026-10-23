"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Modal } from "@/components/app/modal";
import { checkInvitations, invite, withdraw } from "@/app/support/beta/actions";
import { useSupportTranslations } from "@/lib/i18n/use-support-translations";

// As lib/support/beta.ts's placeStatuses, which imports server code this can't.
const statuses = ["added", "invited", "signedUp", "withdrawn"] as const;
type Status = (typeof statuses)[number];

export type Place = {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  language: string;
  status: Status;
  added: string | null;
  addedBy: string | null;
  invited: string | null;
  invitedBy: string | null;
  signedUp: string | null;
  withdrawn: string | null;
  withdrawnBy: string | null;
};

type InvitationCheck = Awaited<ReturnType<typeof checkInvitations>>;

/**
 * The beta list: each place's status and history, filtered by status. Admins
 * also select places to invite, see the email before it goes, and withdraw
 * places nobody has used.
 */
export function BetaTable({ places, isAdmin }: { places: Place[]; isAdmin: boolean }) {
  const t = useSupportTranslations("support.beta");
  const common = useTranslations("common"); // the Support layout passes the app's common words too
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [check, setCheck] = useState<InvitationCheck | null>(null);
  const [withdrawing, setWithdrawing] = useState<Place | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = filter === "all" ? places : places.filter((p) => p.status === filter);
  const invitable = (p: Place) => p.status === "added" || p.status === "invited";
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const by = (name: string | null) => (name ? t("by", { name }) : t("bySql"));

  if (!places.length) return <p className="muted">{t("empty")}</p>;
  return (
    <div className="support-stack">
      <div className="support-row" role="group">
        {(["all", ...statuses] as const).map((s) => (
          <button key={s} type="button" className="secondary" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {t("count", { status: t(`status.${s}`), count: s === "all" ? places.length : places.filter((p) => p.status === s).length })}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="support-row">
          <button
            type="button"
            className="primary"
            disabled={!selected.size || pending}
            onClick={() => start(async () => setCheck(await checkInvitations([...selected])))}
          >
            {t("invite.send", { count: selected.size })}
          </button>
        </div>
      )}
      {result && (
        <p className="notice" role="status">
          {result}
        </p>
      )}

      <ul className="support-places">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="support-row">
              {isAdmin && invitable(p) && (
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={t("invite.select", { email: p.email })} />
              )}
              <strong>{p.email}</strong>
              {p.name && <span>{p.name}</span>}
              <span className={`support-status status-${p.status}`}>{t(`status.${p.status}`)}</span>
              <span className="muted">{p.language}</span>
            </div>
            {p.note && <div className="muted">{p.note}</div>}
            <div className="muted">
              {[
                p.added && `${t("addedOn", { date: p.added })} ${by(p.addedBy)}`,
                p.invited && `${t("invitedOn", { date: p.invited })} ${by(p.invitedBy)}`,
                p.signedUp && t("signedUpOn", { date: p.signedUp }),
                p.withdrawn && `${t("withdrawnOn", { date: p.withdrawn })} ${by(p.withdrawnBy)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {isAdmin && invitable(p) && (
              <button type="button" className="secondary" onClick={() => setWithdrawing(p)}>
                {t("withdraw.button")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {check && (
        <Modal title={t("invite.title", { count: check.count })} onClose={() => setCheck(null)}>
          <div className="support-stack">
            {check.sentBefore > 0 && <p className="notice">{t("invite.sentBefore", { count: check.sentBefore })}</p>}
            {check.emails.map((e) => (
              <div key={e.locale} className="support-stack">
                <h3>{t("invite.previewIn", { language: e.language })}</h3>
                <p>
                  <strong>{t("invite.subject")}</strong> {e.subject}
                </p>
                <pre className="support-email">{e.text}</pre>
              </div>
            ))}
          </div>
          <footer className="modal-actions">
            <button type="button" className="secondary" onClick={() => setCheck(null)}>
              {common("cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={pending || !check.count}
              onClick={() =>
                start(async () => {
                  const done = await invite([...selected]);
                  setCheck(null);
                  setSelected(new Set());
                  setResult([t("invite.sent", { count: done.sent }), done.failed.length ? t("invite.failed", { emails: done.failed.join(", ") }) : ""].join(" ").trim());
                })
              }
            >
              {t("invite.confirm")}
            </button>
          </footer>
        </Modal>
      )}

      {withdrawing && (
        <ConfirmDialog
          title={t("withdraw.title", { email: withdrawing.email })}
          confirmLabel={t("withdraw.confirm")}
          pending={pending}
          onClose={() => setWithdrawing(null)}
          onConfirm={() =>
            start(async () => {
              await withdraw(withdrawing.id);
              setWithdrawing(null);
              setSelected((s) => {
                const next = new Set(s);
                next.delete(withdrawing.id);
                return next;
              });
            })
          }
        >
          <p>{t("withdraw.body")}</p>
          {withdrawing.status === "invited" && <p className="notice">{t("withdraw.invited")}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
