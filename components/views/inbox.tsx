"use client";

import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { projectType, projectTypes } from "@/lib/project-types";

// The review queue: messages the person sent in (upload, paste, and the Gmail
// add-on in M3), each with the system's suggested type, waiting to be filed.
export function InboxView() {
  const data = useAppData();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [active, setActive] = useState("");
  const message = data.inbox.find((m) => m.id === active);

  return (
    <>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Intake</span>
            <h2>待確認的邀約</h2>
          </div>
          <span className="mock-chip">Gmail 外掛即將推出</span>
        </div>
        <p className="muted">上傳截圖、PDF，或貼上邀約文字。系統會整理重點並建議分類，由你確認後才建立合作案。上傳與貼上功能開發中；目前可直接「新增合作案」。</p>
        <div className="row-actions">
          <button className="primary" disabled>
            上傳截圖／PDF
          </button>
          <button className="secondary" disabled>
            貼上邀約文字
          </button>
        </div>
      </section>
      <div className="inbox-layout section-gap">
        <section className="surface padded">
          {!data.inbox.length && (
            <div className="empty">
              <h3>這裡還沒有邀約</h3>
              <p>邀約進件功能開發中，目前可直接新增合作案。</p>
            </div>
          )}
          {data.inbox.map((m) => (
            <div className="mail-item" key={m.id}>
              <button className={`mail-summary ${active === m.id ? "active" : ""}`} onClick={() => setActive(m.id)}>
                <small>{m.sender}</small>
                <strong>{m.subject || "（無主旨）"}</strong>
                <span>{m.body.slice(0, 110)}</span>
              </button>
              <select aria-label={`${m.subject}分類`} value={m.suggestedType ?? ""} disabled>
                <option value="">待確認</option>
                {projectTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
        <section className="surface padded">
          {message ? (
            <>
              <span className="category">{message.suggestedType ? projectType(message.suggestedType).label : "待確認"}</span>
              <h2>{message.subject}</h2>
              <p className="muted">
                {message.sender} · {new Date(message.receivedAt).toLocaleString("zh-TW")}
              </p>
              <p className="prewrap mail-body">{message.body}</p>
              <small className="muted">{message.analysisNote}</small>
              <div className="row-actions section-gap">
                <button
                  className="primary"
                  onClick={() => {
                    const existing = data.projects.find((p) => p.id === message.projectId);
                    setEditor(
                      existing
                        ? { kind: "project", item: projectRecord(existing) }
                        : {
                            kind: "project",
                            item: {
                              title: (message.subject || "新邀約").slice(0, 200),
                              offerText: message.body,
                              counterparty: message.sender,
                              type: message.suggestedType ?? "other",
                            },
                          },
                    );
                  }}
                >
                  建立／開啟合作案
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setEditor({
                      kind: "draft",
                      item: {
                        subject: `Re: ${message.subject}`.slice(0, 200),
                        source: message.body,
                        projectType: message.suggestedType ?? "other",
                        recipient: message.sender.match(/<([^>]+)>/)?.[1] || "",
                      },
                    })
                  }
                >
                  建立回覆草稿
                </button>
              </div>
            </>
          ) : (
            <p className="empty">選擇一封邀約查看內容。</p>
          )}
        </section>
      </div>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
