"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/app/modal";
import { useAppData } from "@/components/app/app-data";
import { useLabels } from "@/lib/i18n/labels";
import { paymentRemaining } from "@/lib/domain/workflow";
import { phaseOf } from "@/lib/domain/phases";
import { stages, type Project, type ProjectSummary, type Stage } from "@/lib/types";
import { useClosingChecks } from "./project-workflow-panel";

/** Stage confirmation is separate from task completion and financial records. */
export function ProjectStageDialog({ project, full, target, pending, error, onTarget, onClose, onConfirm, onMoney }: {
  project: ProjectSummary;
  full: Project | null;
  target: Stage;
  pending: boolean;
  error: string | null;
  onTarget: (stage: Stage) => void;
  onClose: () => void;
  onConfirm: () => void;
  onMoney: () => void;
}) {
  const t = useTranslations("projects");
  const common = useTranslations("common");
  const labels = useLabels();
  const data = useAppData();
  const checks = useClosingChecks(full).filter(c => !c.met);
  const tasks = data.calendar.filter(c => c.projectId === project.id && c.source === "todo" && !c.archived && !c.done);
  const [acknowledged, setAcknowledged] = useState(false);
  const closing = target === "closed";
  const paymentBlocked = closing && data.payments.some(p => p.projectId === project.id && !p.voided && paymentRemaining(p) > 0);
  const outstanding = closing && (tasks.length > 0 || checks.length > 0);
  const unchanged = target === project.stage;
  return (
    <Modal title={t("stageChange.title")} onClose={onClose} narrow>
      <form className="project-stage-form" onSubmit={e => { e.preventDefault(); if (!paymentBlocked && !pending && !unchanged && (!closing || (full && (!outstanding || acknowledged)))) onConfirm(); }}>
        <p className="stage-current-summary">{t("stageChange.current")} <strong>{labels.stage(project.stage)}</strong></p>
        <label className="field">
          <span>{t("stageChange.target")}</span>
          <select value={target} disabled={pending} onChange={e => { setAcknowledged(false); onTarget(e.target.value as Stage); }}>
            {stages.map(stage => <option key={stage} value={stage}>{labels.stage(stage)}</option>)}
          </select>
        </label>
        <p className="stage-destination">{t("stageChange.destination", { phase: t(`phase.${phaseOf(target)}`) })}</p>
        {closing && !full && <p role="status">{t("stageChange.loading")}</p>}
        {outstanding && full && (
          <div className="stage-close-checks">
            <strong>{t("stageChange.review")}</strong>
            <ul>
              {tasks.length > 0 && <li>{t("stageChange.openTasks", {count: tasks.length})}</li>}
              {checks.map(check => <li key={check.key}>{check.open}</li>)}
            </ul>
            {!paymentBlocked && <label className="stage-acknowledge">
              <input type="checkbox" checked={acknowledged} disabled={pending} onChange={e => setAcknowledged(e.target.checked)} />
              <span>{t("stageChange.acknowledge")}</span>
            </label>}
            {paymentBlocked && <p role="status">{t("stageChange.paymentBlocked")}</p>}
          </div>
        )}
        <p className="muted stage-record-note">{t("stageChange.separate")}</p>
        {(target === "collecting_payment" || closing) && <button type="button" className="text-button" disabled={pending} onClick={onMoney}>{t("stageChange.money")}</button>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <footer className="form-actions">
          <button type="button" className="secondary" disabled={pending} onClick={onClose}>{t("stageChange.cancel")}</button>
          <button className="primary" type="submit" disabled={paymentBlocked || pending || unchanged || (closing && (!full || (outstanding && !acknowledged)))}>{pending ? common("saving") : t("stageChange.confirm", {stage: labels.stage(target)})}</button>
        </footer>
      </form>
    </Modal>
  );
}
