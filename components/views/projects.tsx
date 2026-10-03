"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { archiveProject, setProjectStage } from "@/lib/actions/projects";
import { useMoney } from "@/lib/i18n/format";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";
import { stages, type Stage } from "@/lib/types";
import { ProjectWorkflowPanel } from "./project-workflow-panel";

export function ProjectsView({ selectedId = "" }: { selectedId?: string }) {
  const data = useAppData();
  const money = useMoney();
  const router = useRouter();
  const t = useTranslations("projects");
  const labels = useLabels();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState(selectedId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) =>
    startTransition(async () => setError(await action()));
  const visible = data.projects.filter(
    (p) =>
      p.archived === archived &&
      (type === "all" || p.type === type) &&
      `${p.title} ${p.counterparty} ${p.artist}`.toLowerCase().includes(search.toLowerCase()),
  );
  const active = visible.find((p) => p.id === selected) || visible[0];
  const compose = (id: string) => router.push(`/drafts?project=${id}`);

  return (
    <div className="deals-layout">
      <section className="surface deals-table-wrap">
        <div className="toolbar wrap">
          <input aria-label={t("search")} placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label={t("typeFilter")} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">{t("all")}</option>
            {projectTypes.map((pt) => (
              <option key={pt.key} value={pt.key}>
                {labels.projectType(pt.key)}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setEditor({ kind: "project" })}>
            {t("newProject")}
          </button>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("archivedOnly")}
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("colProject")}</th>
                <th>{t("colTypeStage")}</th>
                <th>{t("colQuote")}</th>
                <th>{t("colDue")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={active?.id === p.id ? "selected-row" : ""}>
                  <td>
                    <button className="text-button left" onClick={() => setSelected(p.id)}>
                      <strong>{p.title}</strong>
                      <small>
                        {p.counterparty} · {p.artist}
                      </small>
                    </button>
                  </td>
                  <td>
                    {labels.projectType(p.type)}
                    <small>{labels.stage(p.stage)}</small>
                  </td>
                  <td>{money(projectQuoteTotal(p))}</td>
                  <td>{p.nextAction?.dueDate || t("notSet")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="empty">{t("empty")}</p>}
      </section>
      {active && (
        <aside className="surface deal-detail">
          <span className={`category c-${active.type}`}>{labels.projectType(active.type)}</span>
          <h2>{active.title}</h2>
          <p>
            {active.counterparty} · {active.artist}
          </p>
          <div className="detail-next">
            <small>{t("nextStep", { due: active.nextAction?.dueDate || t("noDue") })}</small>
            <strong>{active.nextAction?.title || t("noNextStep")}</strong>
          </div>
          <label>
            {t("stage")}
            <select
              value={active.stage}
              disabled={pending || active.archived}
              onChange={(e) => run(() => setProjectStage(active.id, e.target.value as Stage))}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {labels.stage(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="deal-summary">
            {(
              [
                [t("detail.offer"), active.offerText],
                [t("detail.contract"), active.details.contractNotes],
                [t("detail.deliverables"), active.details.deliverables],
                [t("detail.rights"), active.details.rights],
                [t("detail.travel"), active.details.travel],
              ] as [string, string | undefined][]
            ).map(([label, value]) => (
              <details key={label}>
                <summary>
                  {value ? t("filled", { label }) : t("missing", { label })}
                </summary>
                <p className="prewrap">{value || t("notFilled")}</p>
              </details>
            ))}
          </div>
          <div className="stack-buttons">
            <button className="primary" onClick={() => setEditor({ kind: "project", item: projectRecord(active) })}>
              {t("editFull")}
            </button>
            <button
              className="secondary"
              onClick={() =>
                setEditor({
                  kind: "calendar",
                  item: { projectId: active.id, title: active.nextAction?.title || active.title },
                })
              }
            >
              {t("addTodo")}
            </button>
            <button
              className="secondary"
              onClick={() =>
                setEditor({
                  kind: "payment",
                  item: {
                    projectId: active.id,
                    label: t("paymentLabel", { title: active.title.slice(0, 190) }),
                    amount: Math.max(0, projectSettlement(data, active).unbilled),
                    taxRate: active.taxRate,
                    taxIncluded: true,
                  },
                })
              }
            >
              {t("addPayment")}
            </button>
            <button
              className="text-button"
              disabled={pending}
              onClick={() => run(() => archiveProject(active.id, !active.archived))}
            >
              {active.archived ? t("restore") : t("archive")}
            </button>
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <ProjectWorkflowPanel key={active.id} project={active} edit={setEditor} compose={compose} />
        </aside>
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}
