"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { PastReplyError, renderTemplate } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes, type ProjectType } from "@/lib/project-types";
import type { ReplyDraft } from "@/lib/types";

const gmailComposeUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", to, su: subject, body })}`;

export function DraftsView({ initialProjectId = "" }: { initialProjectId?: string }) {
  const data = useAppData();
  const t = useTranslations("drafts");
  const tTone = useTranslations("tone");
  const labels = useLabels();
  const money = useMoney(); // the UI language stands in for the template's own until reply_template.language exists
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const initial = data.projects.find((p) => p.id === initialProjectId && !p.archived);
  const recipientFor = (counterpartyId: string | null | undefined) =>
    data.contacts.find((c) => c.id === counterpartyId)?.email || "";

  const [type, setType] = useState<ProjectType>(initial?.type || "gig");
  const [projectId, setProjectId] = useState(initial?.id || "");
  const [templateId, setTemplateId] = useState("");
  const [tone, setTone] = useState(tTone("natural"));
  const [source, setSource] = useState(initial?.offerText || "");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(initial ? `Re: ${initial.title}`.slice(0, 200) : t("defaultSubject"));
  const [recipient, setRecipient] = useState(recipientFor(initial?.counterpartyId));
  const [mode, setMode] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const templates = data.templates.filter((tpl) => tpl.projectType === type && tpl.archived === showArchive);
  const project = data.projects.find((p) => p.id === projectId);

  function load(d: ReplyDraft) {
    setProjectId(d.projectId || "");
    setType(d.projectType);
    setTemplateId("");
    setSource(d.source);
    setBody(d.body);
    setSubject(d.subject);
    setRecipient(d.recipient);
    setMode(t("savedDraftMode"));
  }

  function applyTemplate() {
    const template = data.templates.find((x) => x.id === templateId);
    if (!template) return;
    try {
      const result = renderTemplate(template, source, project, {
        quote: (amount, rate) => t("quoteValue", { amount: money(amount), rate }),
        missing: (field) => t("missingValue", { field }),
      });
      setBody(result.body);
      setMode(
        result.missing.length
          ? t("appliedMissingMode", { fields: result.missing.join(t("listSeparator")) })
          : t("appliedMode"),
      );
    } catch (e) {
      if (e instanceof PastReplyError) setNotice(t("pastReplyRefused"));
      else throw e;
    }
  }

  // The starter template's tokens stay as stored until language-neutral placeholders (i18n step 4).
  const starterTemplate = (type: ProjectType) => ({
    title: t("starterTitle", { type: labels.projectType(type) }),
    projectType: type,
    kind: "template",
    tone: tTone("natural"),
    body: t("starterBody", {
      counterparty: "{{合作方}}",
      artist: "{{藝人}}",
      project: "{{案件名稱}}",
      questions: labels
        .projectQuestions(type)
        .map((q) => `• ${q}`)
        .join("\n"),
    }),
  });

  return (
    <>
      <div className="draft-layout">
        <section className="surface draft-memory">
          <div className="section-header">
            <div>
              <span>Your reply library</span>
              <h2>{t("libraryTitle")}</h2>
            </div>
            <button onClick={() => setEditor({ kind: "template", item: { projectType: type } })}>{t("add")}</button>
          </div>
          <label>
            {t("type")}
            <select value={type} disabled={!!projectId} onChange={(e) => (setType(e.target.value as ProjectType), setTemplateId(""))}>
              {projectTypes.map((pt) => (
                <option key={pt.key} value={pt.key}>
                  {labels.projectType(pt.key)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{t("libraryHelp")}</p>
          <button className="secondary" onClick={() => setEditor({ kind: "template", item: starterTemplate(type) })}>
            {t("useStarter", { type: labels.projectType(type) })}
          </button>
          <label className="check-line">
            <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
            {t("archivedTemplates")}
          </label>
          {templates.map((tpl) => (
            <article className="template-card" key={tpl.id}>
              <label className="check-line">
                <input
                  type="radio"
                  name="template"
                  checked={templateId === tpl.id}
                  disabled={tpl.archived}
                  onChange={() => setTemplateId(tpl.id)}
                />
                <strong>{tpl.title}</strong>
              </label>
              <small>
                {tpl.kind === "template" ? t("kindTemplate") : t("kindPastReply")} · {tpl.tone}
              </small>
              <p>{tpl.body.slice(0, 200)}</p>
              <div className="row-actions">
                <button className="text-button" onClick={() => setEditor({ kind: "template", item: toRecord(tpl) })}>
                  {t("edit")}
                </button>
                {tpl.kind === "past_reply" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setEditor({
                        kind: "template",
                        item: { ...toRecord(tpl), id: "", title: t("templateCopyTitle", { title: tpl.title.slice(0, 190) }), kind: "template" },
                      })
                    }
                  >
                    {t("saveAsTemplateAndEdit")}
                  </button>
                )}
              </div>
            </article>
          ))}
          {!templates.length && <p className="empty">{t("noTemplates")}</p>}
          <input
            ref={file}
            type="file"
            hidden
            accept=".txt,.md,.eml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 30000) return setNotice(t("importTooBig"));
              setEditor({
                kind: "template",
                item: { title: f.name, projectType: type, body: (await f.text()).slice(0, 10000), kind: "past_reply" },
              });
            }}
          />
          <button className="secondary" onClick={() => file.current?.click()}>
            {t("import")}
          </button>
        </section>
        <section className="surface draft-composer">
          <div className="section-header">
            <div>
              <span>Draft composer</span>
              <h2>{t("composerTitle", { type: labels.projectType(type) })}</h2>
            </div>
            <button
              onClick={() => {
                setProjectId("");
                setBody("");
                setSource("");
                setRecipient("");
                setSubject(t("defaultSubject"));
                setMode("");
              }}
            >
              {t("clear")}
            </button>
          </div>
          <label>
            {t("project")}
            <select
              value={projectId}
              onChange={(e) => {
                const p = data.projects.find((x) => x.id === e.target.value);
                setProjectId(p?.id || "");
                setTemplateId("");
                setBody("");
                setMode("");
                setSource(p?.offerText || "");
                setSubject(p ? `Re: ${p.title}`.slice(0, 200) : t("defaultSubject"));
                setRecipient(recipientFor(p?.counterpartyId));
                if (p) setType(p.type);
              }}
            >
              <option value="">{t("unlinked")}</option>
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
            <summary>{t("whatToConfirm")}</summary>
            <ul>
              {labels.projectQuestions(type).map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
          <label>
            {t("subject")}
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            {t("recipient")}
            <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </label>
          <label>
            {t("tone")}
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              {(["natural", "brief", "warm"] as const).map((key) => (
                <option key={key}>{tTone(key)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("source")}
            <textarea rows={5} value={source} onChange={(e) => setSource(e.target.value)} maxLength={20000} />
          </label>
          <button className="primary generate" disabled={!source.trim() || !templateId} onClick={applyTemplate}>
            {t("apply")}
          </button>
          <p className="muted">{t("aiSoon")}</p>
          {notice && (
            <p className="notice error" role="alert">
              {notice}
            </p>
          )}
          <div className="draft-output">
            <span>{mode || t("editableDraft")}</span>
            <textarea aria-label={t("editableDraft")} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="draft-actions">
            <button
              className="secondary"
              disabled={!body.trim()}
              onClick={() => setEditor({ kind: "template", item: { title: subject, projectType: type, body, tone, kind: "template" } })}
            >
              {t("saveAsTemplate")}
            </button>
            <button
              className="secondary"
              disabled={!body.trim()}
              onClick={async () => {
                await navigator.clipboard.writeText(body);
                setNotice("");
                setMode(t("copied"));
              }}
            >
              {t("copy")}
            </button>
            <button className="primary" disabled title={t("saveSoon")}>
              {t("save")}
            </button>
          </div>
          <a
            className={`secondary full section-gap ${!body.trim() ? "disabled" : ""}`}
            aria-disabled={!body.trim()}
            href={body.trim() ? gmailComposeUrl(recipient, subject, body) : undefined}
            target="_blank"
            rel="noreferrer"
          >
            {t("openGmail")}
          </a>
          <p className="muted">{t("openGmailHelp")}</p>
        </section>
      </div>
      <section className="surface padded section-gap">
        <div className="section-header">
          <div>
            <span>Saved drafts</span>
            <h2>{t("savedTitle")}</h2>
          </div>
        </div>
        {data.drafts
          .filter((d) => !d.archived)
          .map((d) => (
            <div className="saved-row" key={d.id}>
              <button className="text-button" onClick={() => load(d)}>
                {d.subject} · {labels.projectType(d.projectType)}
              </button>
            </div>
          ))}
        {!data.drafts.filter((d) => !d.archived).length && <p className="empty">{t("savedEmpty")}</p>}
      </section>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
