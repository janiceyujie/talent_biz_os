"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Modal } from "@/components/app/modal";
import { Toast } from "@/components/app/toast";
import { MoreMenu } from "@/components/views/more-menu";
import { checkInvitations, invite, withdraw } from "@/app/support/beta/actions";
import { useSupportTranslations } from "@/lib/i18n/use-support-translations";
import { BetaAdd } from "./beta-add";

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
 * The beta list: who's on it and where each stands, searched and filtered, since
 * finding someone is what it's opened for most. Admins also add a batch (a
 * dialog, which selects who was added), select places and see the email before
 * it goes, and withdraw places nobody has used (a row's ⋯ menu: it's rare, and
 * shouldn't sit beside everything else).
 */
export function BetaTable({ places, isAdmin, locales, defaultLocale }: { places: Place[]; isAdmin: boolean; locales: { value: string; name: string }[]; defaultLocale: string }) {
  const t = useSupportTranslations("support.beta");
  const common = useTranslations("common"); // the Support layout passes the app's common words too
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  // By email, not id: a batch just added is selected by its emails before its rows arrive.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  // The batch just added, selected for it: the bar says so until the selection changes.
  const [justAdded, setJustAdded] = useState<string[] | null>(null);
  const [check, setCheck] = useState<InvitationCheck | null>(null);
  const [withdrawing, setWithdrawing] = useState<Place | null>(null);
  const [sent, setSent] = useState<string | null>(null); // a toast: it closes itself, as does the one after adding
  const [failed, setFailed] = useState<string[]>([]); // stays until the next send: they need trying again
  const [pending, start] = useTransition();

  const words = query.trim().toLowerCase();
  const shown = places.filter(
    (p) => (filter === "all" || p.status === filter) && (!words || [p.email, p.name, p.note].some((v) => v?.toLowerCase().includes(words))),
  );
  const invitable = (p: Place) => p.status === "added" || p.status === "invited";
  // Only places that can still be invited count as selected: one withdrawn since drops out.
  const chosen = places.filter((p) => invitable(p) && selected.has(p.email));
  const shownInvitable = shown.filter(invitable);
  const select = (next: Set<string>) => {
    setSelected(next);
    setJustAdded(null);
  };
  const toggle = (email: string) => {
    const next = new Set(selected);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    select(next);
  };
  const by = (name: string | null) => (name ? t("by", { name }) : t("bySql"));

  return (
    <div className="support-stack">
      <div className="support-row support-heading">
        <h2>{t("heading")}</h2>
        {isAdmin && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            {t("add.open")}
          </button>
        )}
      </div>
      {!places.length && <p className="muted">{t("empty")}</p>}
      {places.length > 0 && (
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} autoComplete="off" spellCheck={false} />
      )}
      <div className="support-row" role="group">
        {(["all", ...statuses] as const).map((s) => (
          <button key={s} type="button" className="secondary" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {t("count", { status: t(`status.${s}`), count: s === "all" ? places.length : places.filter((p) => p.status === s).length })}
          </button>
        ))}
      </div>

      {isAdmin && shownInvitable.length > 0 && (
        <label className="support-row">
          <input
            type="checkbox"
            checked={shownInvitable.every((p) => selected.has(p.email))}
            onChange={(e) => {
              const next = new Set(selected);
              for (const p of shownInvitable) if (e.target.checked) next.add(p.email);
              else next.delete(p.email);
              select(next);
            }}
          />
          {t("selectAll", { count: shownInvitable.length })}
        </label>
      )}
      {failed.length > 0 && (
        <p className="notice error" role="alert">
          {t("invite.failed", { emails: failed.join(", ") })}
        </p>
      )}
      {sent && <Toast key={sent} message={sent} onClose={() => setSent(null)} />}

      {places.length > 0 && !shown.length && <p className="muted">{t("noMatch")}</p>}
      <ul className="support-places">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="support-row">
              {isAdmin && invitable(p) && (
                <input type="checkbox" checked={selected.has(p.email)} onChange={() => toggle(p.email)} aria-label={t("invite.select", { email: p.email })} />
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
              <div className="support-row-menu">
                <MoreMenu label={t("more", { email: p.email })}>
                  <button role="menuitem" onClick={() => setWithdrawing(p)}>
                    {t("withdraw.button")}
                  </button>
                </MoreMenu>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* While some are selected, what to do with them stays on screen, however far down the list. */}
      {isAdmin && chosen.length > 0 && (
        <div className="support-action-bar" role="region" aria-label={t("selected", { count: chosen.length })}>
          <span>{justAdded ? t("addedSelected", { count: chosen.length }) : t("selected", { count: chosen.length })}</span>
          <button type="button" className="secondary" onClick={() => select(new Set())}>
            {t("clearSelection")}
          </button>
          <button type="button" className="primary" disabled={pending} onClick={() => start(async () => setCheck(await checkInvitations(chosen.map((p) => p.id))))}>
            {t("invite.send", { count: chosen.length })}
          </button>
        </div>
      )}

      {adding && (
        <Modal title={t("add.heading")} onClose={() => setAdding(false)}>
          <BetaAdd
            locales={locales}
            defaultLocale={defaultLocale}
            onAdded={(emails) => {
              setAdding(false);
              setFilter("all");
              setQuery("");
              setSelected(new Set(emails));
              setJustAdded(emails);
            }}
          />
        </Modal>
      )}

      {check && (
        <Modal title={t("invite.title", { count: check.count })} onClose={() => setCheck(null)}>
          <div className="support-stack">
            {check.sentBefore > 0 && <p className="notice">{t("invite.sentBefore", { count: check.sentBefore })}</p>}
            <h3>{t("invite.recipients")}</h3>
            <ul className="support-list">
              {check.recipients.map((r) => (
                <li key={r.email}>
                  {r.name ? `${r.name}, ${r.email}` : r.email} <span className="muted">{[r.language, r.sentBefore && t("invite.sentBeforeMark")].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
            {check.emails.map((e) => (
              <div key={e.locale} className="support-stack">
                <h3>{t("invite.previewIn", { language: e.language, who: e.sample })}</h3>
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
                  const done = await invite(chosen.map((p) => p.id));
                  setCheck(null);
                  select(new Set());
                  setFailed(done.failed);
                  if (done.sent) setSent(t("invite.sent", { count: done.sent }));
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
                next.delete(withdrawing.email);
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
