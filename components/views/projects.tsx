"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { money } from "@/lib/domain/money";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { stageLabels } from "@/lib/labels";
import { projectType, projectTypes } from "@/lib/project-types";
import { stages } from "@/lib/types";
import { ProjectWorkflowPanel } from "./project-workflow-panel";

export function ProjectsView({ selectedId = "" }: { selectedId?: string }) {
  const data = useAppData();
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState(selectedId);
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
          <input aria-label="搜尋合作案" placeholder="搜尋案件、公司或藝人" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="商案分類篩選" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">全部</option>
            {projectTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setEditor({ kind: "project" })}>
            新增合作案
          </button>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          已歸檔合作案
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>合作案</th>
                <th>類型／階段</th>
                <th>含稅報價</th>
                <th>期限</th>
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
                    {projectType(p.type).label}
                    <small>{stageLabels[p.stage]}</small>
                  </td>
                  <td>{money(projectQuoteTotal(p))}</td>
                  <td>{p.nextAction?.dueDate || "未設定"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="empty">沒有符合條件的案件。新增第一筆合作或調整篩選。</p>}
      </section>
      {active && (
        <aside className="surface deal-detail">
          <span className={`category c-${projectType(active.type).label}`}>{projectType(active.type).label}</span>
          <h2>{active.title}</h2>
          <p>
            {active.counterparty} · {active.artist}
          </p>
          <div className="detail-next">
            <small>下一步 · {active.nextAction?.dueDate || "未設定期限"}</small>
            <strong>{active.nextAction?.title || "尚未設定"}</strong>
          </div>
          <label>
            案件階段
            <select value={active.stage} disabled>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {stageLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="deal-summary">
            {[
              ["Offer", active.offerText],
              ["合約", active.details.contractNotes],
              ["交付", active.details.deliverables],
              ["授權", active.details.rights],
              ["交通住宿", active.details.travel],
            ].map(([label, value]) => (
              <details key={label}>
                <summary>
                  {label} · {value ? "已填寫" : "待補充"}
                </summary>
                <p className="prewrap">{value || "尚未填寫"}</p>
              </details>
            ))}
          </div>
          <div className="stack-buttons">
            <button className="primary" onClick={() => setEditor({ kind: "project", item: projectRecord(active) })}>
              編輯完整合作案
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
              新增關聯待辦
            </button>
            <button
              className="secondary"
              onClick={() =>
                setEditor({
                  kind: "payment",
                  item: {
                    projectId: active.id,
                    label: `${active.title.slice(0, 190)} 請款`,
                    amount: Math.max(0, projectSettlement(data, active).unbilled),
                    taxRate: active.taxRate,
                    taxIncluded: true,
                  },
                })
              }
            >
              新增關聯請款
            </button>
          </div>
          <ProjectWorkflowPanel key={active.id} project={active} edit={setEditor} compose={compose} />
        </aside>
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}
