"use client";

import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { createPaymentPlan } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { money, splitPayments } from "@/lib/domain/money";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { paymentStatusLabel } from "@/lib/labels";
import { projectType } from "@/lib/project-types";
import type { Project } from "@/lib/types";

/** What to confirm, settlement, the deposit/balance split, and the closing check for one project. */
export function ProjectWorkflowPanel({
  project,
  edit,
  compose,
}: {
  project: Project;
  edit: (e: Editor) => void;
  compose: (id: string) => void;
}) {
  const data = useAppData();
  const today = dateInZone(data.talent.timeZone);
  const [plan, setPlan] = useState(false);
  const [percent, setPercent] = useState(50);
  const [depositDue, setDepositDue] = useState(today);
  const [balanceDue, setBalanceDue] = useState(project.nextAction?.dueDate || today);
  const [pending, startTransition] = useTransition();
  const [planError, setPlanError] = useState<string | null>(null);
  const settlement = projectSettlement(data, project);
  const payments = data.payments.filter((p) => p.projectId === project.id && !p.archived);
  const items = data.calendar.filter((c) => c.projectId === project.id && !c.archived);
  const drafts = data.drafts.filter((d) => d.projectId === project.id && !d.archived);
  const files = data.files.filter((f) => f.projectId === project.id && !f.archived);
  const hasIncome = payments.some((p) => p.direction === "in");

  let preview: ReturnType<typeof splitPayments> | undefined;
  try {
    preview = splitPayments(projectQuoteTotal(project), percent);
  } catch {}

  const warnings = [
    !project.details.contractNotes && "尚未登錄合約內容",
    !project.details.deliverables && "尚未登錄交付項目",
    !items.length && "尚未登錄行程／交付待辦",
    settlement.openItems.length > 0 && `${settlement.openItems.length} 筆待辦尚未完成`,
    settlement.unbilled > 0 && `尚未建立請款 ${money(settlement.unbilled)}`,
    settlement.unbilled < 0 && `請款超過報價 ${money(-settlement.unbilled)}，請確認是否重複或報價尚未更新`,
    settlement.pending > 0 && `尚有待收款 ${money(settlement.pending)}`,
    settlement.shortfall > 0 && `實收較請款少 ${money(settlement.shortfall)}（扣繳或手續費？請確認）`,
    settlement.unpaidCosts.length > 0 && `${settlement.unpaidCosts.length} 筆成本尚未支付`,
  ].filter(Boolean);

  return (
    <section aria-label="案件流程與收款">
      <h3>本案要確認的資訊</h3>
      <ul>
        {projectType(project.type).questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <button className="secondary full" disabled={project.archived} onClick={() => compose(project.id)}>
        帶入本案擬稿
      </button>
      <h3>本案收款 · TWD</h3>
      <dl>
        {[
          ["含稅報價", settlement.quoted],
          ["已建立請款", settlement.billed],
          ["已收款", settlement.received],
          ["待收款", settlement.pending],
          ...(settlement.shortfall > 0 ? [["實收差額", settlement.shortfall] as const] : []),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <button
        className="secondary full"
        disabled={hasIncome || project.archived || project.quotedAmount <= 0}
        onClick={() => setPlan(true)}
      >
        建立訂金與尾款
      </button>
      {hasIncome && <p className="muted">已有請款；請在下方編輯既有款項，避免重複計入。</p>}
      <h3>結案前檢查</h3>
      {warnings.length ? (
        <ul>
          {warnings.map((w) => (
            <li key={String(w)}>{w}</li>
          ))}
        </ul>
      ) : (
        <p>已登錄的待辦與收付已核對；仍請人工確認交付驗收與合約義務。</p>
      )}
      <p className="muted">階段由你確認，變更階段不會自動記為收款或完成待辦。</p>
      <h3>相關紀錄</h3>
      <div className="stack-buttons">
        {items.map((c) => (
          <button key={c.id} className="text-button left" onClick={() => edit({ kind: "calendar", item: toRecord(c) })}>
            {c.done ? "已完成" : "待辦"} · {c.date} · {c.title}
          </button>
        ))}
        {payments.map((p) => (
          <button key={p.id} className="text-button left" onClick={() => edit({ kind: "payment", item: toRecord(p) })}>
            {paymentStatusLabel(p)} · {p.label}
          </button>
        ))}
        {drafts.map((d) => (
          <button key={d.id} className="text-button left" onClick={() => edit({ kind: "draft", item: toRecord(d) })}>
            草稿 · {d.subject}
          </button>
        ))}
        {files.map((f) => (
          <span key={f.id}>檔案 · {f.filename}</span>
        ))}
        {!items.length && !payments.length && !drafts.length && !files.length && <p className="muted">尚無關聯紀錄。</p>}
      </div>
      {plan && (
        <Modal title="確認訂金與尾款" onClose={() => setPlan(false)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const failure = await createPaymentPlan({ projectId: project.id, percent, depositDue, balanceDue });
                setPlanError(failure);
                if (!failure) setPlan(false);
              });
            }}
          >
            <p>依本案含稅報價建立兩筆待收款；此操作不代表款項已收到。</p>
            <label>
              訂金比例 %
              <input
                type="number"
                min="0.01"
                max="99.99"
                step="0.01"
                required
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
            </label>
            <label>
              訂金付款期限
              <input type="date" required value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
            </label>
            <label>
              尾款付款期限
              <input type="date" required min={depositDue} value={balanceDue} onChange={(e) => setBalanceDue(e.target.value)} />
            </label>
            {preview ? (
              <p>
                訂金 {money(preview.deposit)} ＋ 尾款 {money(preview.balance)} ＝ {money(preview.total)}（含稅）
              </p>
            ) : (
              <p role="alert">請確認報價及比例，拆分後兩筆金額都必須大於零。</p>
            )}
            <p className="muted">尾款承接四捨五入差額。需要三期以上或不等額付款，可改用新增關聯請款，逐筆登錄。</p>
            {planError && (
              <p className="notice error" role="alert">
                {planError}
              </p>
            )}
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setPlan(false)}>
                取消
              </button>
              <button type="submit" className="primary" disabled={pending || !preview}>
                確認建立兩筆待收款
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
