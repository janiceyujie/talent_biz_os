"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";

// The review queue: messages the person sent in (upload, paste, and the Gmail
// add-on in M3), each with the system's suggested type, waiting to be filed.
export function InboxView() {
  const data = useAppData();
  const t = useTranslations("inbox");
  const labels = useLabels();
  const format = useFormatter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [active, setActive] = useState("");
  const message = data.inbox.find((m) => m.id === active);

  return (
    <>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Intake</span>
            <h2>{t("title")}</h2>
          </div>
          <span className="mock-chip">{t("gmailSoon")}</span>
        </div>
        <p className="muted">{t("intro")}</p>
        <div className="row-actions">
          <button className="primary" disabled>
            {t("upload")}
          </button>
          <button className="secondary" disabled>
            {t("paste")}
          </button>
        </div>
      </section>
      <div className="inbox-layout section-gap">
        <section className="surface padded">
          {!data.inbox.length && (
            <div className="empty">
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyBody")}</p>
            </div>
          )}
          {data.inbox.map((m) => (
            <div className="mail-item" key={m.id}>
              <button className={`mail-summary ${active === m.id ? "active" : ""}`} onClick={() => setActive(m.id)}>
                <small>{m.sender}</small>
                <strong>{m.subject || t("noSubject")}</strong>
                <span>{m.body.slice(0, 110)}</span>
              </button>
              <select aria-label={t("typeOf", { subject: m.subject })} value={m.suggestedType ?? ""} disabled>
                <option value="">{labels.unconfirmed()}</option>
                {projectTypes.map((pt) => (
                  <option key={pt.key} value={pt.key}>
                    {labels.projectType(pt.key)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
        <section className="surface padded">
          {message ? (
            <>
              <span className="category">{message.suggestedType ? labels.projectType(message.suggestedType) : labels.unconfirmed()}</span>
              <h2>{message.subject}</h2>
              <p className="muted">
                {message.sender} · {format.dateTime(new Date(message.receivedAt), { dateStyle: "medium", timeStyle: "short" })}
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
                              title: (message.subject || t("newOffer")).slice(0, 200),
                              offerText: message.body,
                              counterparty: message.sender,
                              type: message.suggestedType ?? "other",
                            },
                          },
                    );
                  }}
                >
                  {t("openProject")}
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
                  {t("draftReply")}
                </button>
              </div>
            </>
          ) : (
            <p className="empty">{t("pick")}</p>
          )}
        </section>
      </div>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
