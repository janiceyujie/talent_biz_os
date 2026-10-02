"use client";

import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { contactRoleLabels } from "@/lib/labels";
import { contactRoles } from "@/lib/types";

export function ContactsView() {
  const data = useAppData();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [archived, setArchived] = useState(false);
  const visible = data.contacts.filter(
    (c) =>
      c.archived === archived &&
      (role === "all" || c.role === role) &&
      `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <div className="toolbar wrap">
        <input aria-label="搜尋聯絡人" placeholder="搜尋名稱、公司或 Email" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="聯絡人類型" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">全部</option>
          {contactRoles.map((r) => (
            <option key={r} value={r}>
              {contactRoleLabels[r]}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => setEditor({ kind: "contact" })}>
          ＋新增藝人／合作方
        </button>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          已歸檔
        </label>
      </div>
      <div className="contact-grid">
        {visible.map((c) => (
          <article className="surface contact-card" key={c.id}>
            <div className="contact-avatar">{c.name.slice(0, 1)}</div>
            <span className="category">{contactRoleLabels[c.role]}</span>
            <h2>{c.name}</h2>
            <p className="muted">{c.company || "尚未填寫公司"}</p>
            <p>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "尚未填寫 Email"}</p>
            <p>{c.phone || "尚未填寫電話"}</p>
            <p className="prewrap">{c.notes}</p>
            <div className="related-deals">
              <small>相關合作案</small>
              {data.projects
                .filter((p) => !p.archived && p.counterpartyId === c.id)
                .map((p) => (
                  <button className="text-button" key={p.id} onClick={() => setEditor({ kind: "project", item: projectRecord(p) })}>
                    {p.title}
                  </button>
                ))}
            </div>
            <div className="row-actions">
              <button className="secondary" onClick={() => setEditor({ kind: "contact", item: toRecord(c) })}>
                編輯資料
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="surface empty">
          <h2>建立你的合作名單</h2>
          <p>藝人、品牌窗口與經紀人的資料都可以在這裡保存。</p>
          <button className="primary" onClick={() => setEditor({ kind: "contact" })}>
            新增第一位聯絡人
          </button>
        </div>
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
