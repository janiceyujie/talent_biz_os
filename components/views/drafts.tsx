"use client";

import { useLocale } from "next-intl";
import { useRef, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { renderTemplate, starterTemplate } from "@/lib/domain/workflow";
import { projectType, projectTypes, type ProjectType } from "@/lib/project-types";
import type { ReplyDraft } from "@/lib/types";

const gmailComposeUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", to, su: subject, body })}`;

export function DraftsView({ initialProjectId = "" }: { initialProjectId?: string }) {
  const data = useAppData();
  const locale = useLocale(); // stands in for the template's own language until reply_template.language exists
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const initial = data.projects.find((p) => p.id === initialProjectId && !p.archived);
  const recipientFor = (counterpartyId: string | null | undefined) =>
    data.contacts.find((c) => c.id === counterpartyId)?.email || "";

  const [type, setType] = useState<ProjectType>(initial?.type || "gig");
  const [projectId, setProjectId] = useState(initial?.id || "");
  const [templateId, setTemplateId] = useState("");
  const [tone, setTone] = useState("自然專業");
  const [source, setSource] = useState(initial?.offerText || "");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(initial ? `Re: ${initial.title}`.slice(0, 200) : "商案合作回覆");
  const [recipient, setRecipient] = useState(recipientFor(initial?.counterpartyId));
  const [mode, setMode] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const templates = data.templates.filter((t) => t.projectType === type && t.archived === showArchive);
  const project = data.projects.find((p) => p.id === projectId);

  function load(d: ReplyDraft) {
    setProjectId(d.projectId || "");
    setType(d.projectType);
    setTemplateId("");
    setSource(d.source);
    setBody(d.body);
    setSubject(d.subject);
    setRecipient(d.recipient);
    setMode("已保存的草稿");
  }

  function applyTemplate() {
    const template = data.templates.find((t) => t.id === templateId);
    if (!template) return;
    try {
      const result = renderTemplate(template, source, project, locale);
      setBody(result.body);
      setMode(result.missing.length ? `已套用範本 · 待確認：${result.missing.join("、")}` : "已套用範本");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  return (
    <>
      <div className="draft-layout">
        <section className="surface draft-memory">
          <div className="section-header">
            <div>
              <span>Your reply library</span>
              <h2>過往回覆與範本</h2>
            </div>
            <button onClick={() => setEditor({ kind: "template", item: { projectType: type } })}>＋新增</button>
          </div>
          <label>
            商案類型
            <select value={type} disabled={!!projectId} onChange={(e) => (setType(e.target.value as ProjectType), setTemplateId(""))}>
              {projectTypes.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">每一類商案分開保存。回覆範本會替換當次案件欄位；過往回覆僅供參考，先移除舊案資料再另存範本。</p>
          <button className="secondary" onClick={() => setEditor({ kind: "template", item: starterTemplate(type) })}>
            使用{projectType(type).label}起始範本
          </button>
          <label className="check-line">
            <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
            已歸檔範本
          </label>
          {templates.map((t) => (
            <article className="template-card" key={t.id}>
              <label className="check-line">
                <input
                  type="radio"
                  name="template"
                  checked={templateId === t.id}
                  disabled={t.archived}
                  onChange={() => setTemplateId(t.id)}
                />
                <strong>{t.title}</strong>
              </label>
              <small>
                {t.kind === "template" ? "回覆範本" : "過往回覆"} · {t.tone}
              </small>
              <p>{t.body.slice(0, 200)}</p>
              <div className="row-actions">
                <button className="text-button" onClick={() => setEditor({ kind: "template", item: toRecord(t) })}>
                  編輯
                </button>
                {t.kind === "past_reply" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setEditor({
                        kind: "template",
                        item: { ...toRecord(t), id: "", title: `${t.title.slice(0, 190)}（範本）`, kind: "template" },
                      })
                    }
                  >
                    另存為範本並調整
                  </button>
                )}
              </div>
            </article>
          ))}
          {!templates.length && <p className="empty">尚無這一類的範本，先新增或匯入。</p>}
          <input
            ref={file}
            type="file"
            hidden
            accept=".txt,.md,.eml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 30000) return setNotice("範例請控制在 30 KB 以內。");
              setEditor({
                kind: "template",
                item: { title: f.name, projectType: type, body: (await f.text()).slice(0, 10000), kind: "past_reply" },
              });
            }}
          />
          <button className="secondary" onClick={() => file.current?.click()}>
            匯入 TXT／Markdown／EML 回覆
          </button>
        </section>
        <section className="surface draft-composer">
          <div className="section-header">
            <div>
              <span>Draft composer</span>
              <h2>{projectType(type).label}回覆草稿</h2>
            </div>
            <button
              onClick={() => {
                setProjectId("");
                setBody("");
                setSource("");
                setRecipient("");
                setSubject("商案合作回覆");
                setMode("");
              }}
            >
              清空編輯器
            </button>
          </div>
          <label>
            關聯合作案
            <select
              value={projectId}
              onChange={(e) => {
                const p = data.projects.find((x) => x.id === e.target.value);
                setProjectId(p?.id || "");
                setTemplateId("");
                setBody("");
                setMode("");
                setSource(p?.offerText || "");
                setSubject(p ? `Re: ${p.title}`.slice(0, 200) : "商案合作回覆");
                setRecipient(recipientFor(p?.counterpartyId));
                if (p) setType(p.type);
              }}
            >
              <option value="">未關聯</option>
              {data.projects
                .filter((p) => !p.archived || p.id === projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <details>
            <summary>這類合作要確認什麼？</summary>
            <ul>
              {projectType(type).questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
          <label>
            主旨
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            收件人
            <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </label>
          <label>
            語氣
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              {["自然專業", "簡短直接", "親切熱情"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            這次邀約內容
            <textarea rows={5} value={source} onChange={(e) => setSource(e.target.value)} maxLength={20000} />
          </label>
          <button className="primary generate" disabled={!source.trim() || !templateId} onClick={applyTemplate}>
            套用選取範本
          </button>
          <p className="muted">AI 擬稿（一次產生多個版本）開發中；目前可先套用範本。</p>
          {notice && (
            <p className="notice error" role="alert">
              {notice}
            </p>
          )}
          <div className="draft-output">
            <span>{mode || "可編輯草稿"}</span>
            <textarea aria-label="可編輯草稿" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="draft-actions">
            <button
              className="secondary"
              disabled={!body.trim()}
              onClick={() => setEditor({ kind: "template", item: { title: subject, projectType: type, body, tone, kind: "template" } })}
            >
              另存為範本
            </button>
            <button
              className="secondary"
              disabled={!body.trim()}
              onClick={async () => {
                await navigator.clipboard.writeText(body);
                setNotice("");
                setMode("已複製草稿");
              }}
            >
              複製
            </button>
            <button className="primary" disabled title="草稿尚未接上資料庫">
              儲存草稿
            </button>
          </div>
          <a
            className={`secondary full section-gap ${!body.trim() ? "disabled" : ""}`}
            aria-disabled={!body.trim()}
            href={body.trim() ? gmailComposeUrl(recipient, subject, body) : undefined}
            target="_blank"
            rel="noreferrer"
          >
            在 Gmail 開啟撰寫視窗
          </a>
          <p className="muted">會開啟預先填好的 Gmail 撰寫視窗，由你確認後自行寄出。</p>
        </section>
      </div>
      <section className="surface padded section-gap">
        <div className="section-header">
          <div>
            <span>Saved drafts</span>
            <h2>已保存的草稿</h2>
          </div>
        </div>
        {data.drafts
          .filter((d) => !d.archived)
          .map((d) => (
            <div className="saved-row" key={d.id}>
              <button className="text-button" onClick={() => load(d)}>
                {d.subject} · {projectType(d.projectType).label}
              </button>
            </div>
          ))}
        {!data.drafts.filter((d) => !d.archived).length && <p className="empty">儲存後可從這裡繼續編輯。</p>}
      </section>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
