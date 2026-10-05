"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archiveTemplate } from "@/lib/actions/templates";
import { PastReplyError, renderTemplate } from "@/lib/domain/workflow";
import { localeNames, toLocale } from "@/lib/i18n/config";
import { useLabels } from "@/lib/i18n/labels";
import { defaultProjectType, projectTypes, type ProjectType } from "@/lib/project-types";
import { displayName, placeholderKeys, toDisplay, type PlaceholderKey } from "@/lib/templates/placeholders";
import type { ReplyDraft } from "@/lib/types";

const gmailComposeUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", to, su: subject, body })}`;

export function DraftsView({ initialProjectId = "" }: { initialProjectId?: string }) {
  const data = useAppData();
  const t = useTranslations("drafts");
  const tEyebrow = useTranslations("eyebrow");
  const tTone = useTranslations("tone");
  const tEditor = useTranslations("editor");
  const router = useRouter();
  const labels = useLabels();
  const uiLocale = toLocale(useLocale());
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const initial = data.projects.find((p) => p.id === initialProjectId && !p.archived);
  const recipientFor = (counterpartyId: string | null | undefined) =>
    data.contacts.find((c) => c.id === counterpartyId)?.email || "";

  const [type, setType] = useState<ProjectType>(initial?.type || defaultProjectType);
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
    setBaseline(JSON.stringify([d.projectId || "", d.subject, d.recipient, d.projectType, d.source, d.body]));
  }

  function applyTemplate() {
    const template = data.templates.find((x) => x.id === templateId);
    if (!template) return;
    try {
      // The reply is written in the template's language; this status line is in the reader's.
      const result = renderTemplate(template, source, project);
      const shown = result.missing.map((name) =>
        placeholderKeys.includes(name as PlaceholderKey) ? displayName(name as PlaceholderKey, uiLocale) : name,
      );
      setBody(result.body);
      setMode(result.missing.length ? t("appliedMissingMode", { fields: shown.join(" · ") }) : t("appliedMode"));
    } catch (e) {
      if (e instanceof PastReplyError) setNotice(t("pastReplyRefused"));
      else throw e;
    }
  }

  // A starter template in the reader's language, with neutral placeholders (the editor shows them localized).
  const starterTemplate = (type: ProjectType) => ({
    title: t("starterTitle", { type: labels.projectType(type) }),
    projectType: type,
    kind: "template",
    language: uiLocale,
    tone: tTone("natural"),
    body: t("starterBody", {
      counterparty: "{{counterparty}}",
      artist: "{{artist}}",
      project: "{{project}}",
      questions: labels
        .projectQuestions(type)
        .map((q) => `• ${q}`)
        .join("\n"),
    }),
  });

  // Unsaved-text protection (prototype phase 6): the composer is "dirty" once its content differs from
  // what was last loaded or reset. Drafts aren't stored yet, so a reset is the only baseline.
  const content = JSON.stringify([projectId, subject, recipient, type, source, body]);
  const [baseline, setBaseline] = useState(content);
  const dirty = content !== baseline;
  const [pendingChange, setPendingChange] = useState<{ run: () => void; replace: boolean } | null>(null);
  /** Run a change that would discard the composer's text, asking first when there's unsaved text. */
  const requestChange = (run: () => void, replace = false) => {
    if (dirty || replace) setPendingChange({ run, replace });
    else run();
  };
  // Leaving the page: the browser's own prompt on reload or close; in-app links ask with the same dialog.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingChange({ run: () => router.push(url.pathname + url.search), replace: false });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);
  const selectedTemplate = data.templates.find((x) => x.id === templateId && !x.archived && x.projectType === type);

  /** Clear or switch: prefill from the project, and make that the new baseline. */
  const resetTo = (p: (typeof data.projects)[number] | undefined) => {
    const next = {
      projectId: p?.id || "",
      subject: p ? `Re: ${p.title}`.slice(0, 200) : t("defaultSubject"),
      recipient: recipientFor(p?.counterpartyId),
      type: p?.type || type,
      source: p?.offerText || "",
    };
    setProjectId(next.projectId);
    setSubject(next.subject);
    setRecipient(next.recipient);
    setType(next.type);
    setSource(next.source);
    setBody("");
    setTemplateId("");
    setMode("");
    setBaseline(JSON.stringify([next.projectId, next.subject, next.recipient, next.type, next.source, ""]));
  };

  return (
    <div className="draft-workspace">
      <fieldset className="draft-edit-fields" disabled={!!pendingChange}>
        <div className="draft-layout">
          <section className="surface draft-memory">
            <div className="section-header">
              <div>
                <span>{tEyebrow("replyLibrary")}</span>
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
              <input
                type="checkbox"
                checked={showArchive}
                onChange={(e) => {
                  setShowArchive(e.target.checked);
                  setTemplateId(""); // an archived template can't be applied
                }}
              />
              {t("archivedTemplates")}
            </label>
            {/* Scrolls on its own on narrow screens, so the composer isn't below every template. */}
            <div className="template-list" role="region" aria-label={t("templateList")} tabIndex={0}>
              {templates.map((tpl) => (
                <article className={`template-card ${templateId === tpl.id ? "is-selected" : ""}`} key={tpl.id}>
                  <label className="check-line">
                    <input type="radio" name="template" checked={templateId === tpl.id} disabled={tpl.archived} onChange={() => setTemplateId(tpl.id)} />
                    <strong>{tpl.title}</strong>
                  </label>
                  <small>
                    {tpl.kind === "template" ? t("kindTemplate") : t("kindPastReply")} · {localeNames[tpl.language]}
                    {tpl.tone ? ` · ${tpl.tone}` : ""}
                  </small>
                  <details className="template-preview">
                    <summary>{t("previewTemplate")}</summary>
                    <p className="prewrap">{toDisplay(tpl.body, uiLocale)}</p>
                  </details>
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
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          if (templateId === tpl.id) setTemplateId("");
                          setNotice((await archiveTemplate(tpl.id, !tpl.archived)) ?? "");
                        })
                      }
                    >
                      {tpl.archived ? t("restore") : t("archive")}
                    </button>
                  </div>
                </article>
              ))}
              {!templates.length && <p className="empty">{t("noTemplates")}</p>}
            </div>
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
                <span>{tEyebrow("draftComposer")}</span>
                <h2>{t("composerTitle", { type: labels.projectType(type) })}</h2>
              </div>
              <button onClick={() => requestChange(() => resetTo(undefined))}>{t("clear")}</button>
            </div>

            <section className="draft-section" aria-label={t("sectionOffer")}>
              <h3>{t("sectionOffer")}</h3>
              <label>
                {t("project")}
                <select
                  value={projectId}
                  onChange={(e) => {
                    const p = data.projects.find((x) => x.id === e.target.value);
                    requestChange(() => resetTo(p));
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
                {t("source")}
                <textarea rows={5} value={source} onChange={(e) => setSource(e.target.value)} maxLength={20000} />
              </label>
            </section>

            <section className="draft-section draft-generation" aria-label={t("sectionSettings")}>
              <h3>{t("sectionSettings")}</h3>
              <div className="draft-template-context">
                <span>{t("selectedTemplate")}</span>
                <strong>{selectedTemplate ? selectedTemplate.title : t("noTemplateSelected")}</strong>
                {selectedTemplate && <small>{selectedTemplate.kind === "template" ? t("kindTemplate") : t("kindPastReply")}</small>}
              </div>
              <label>
                {t("tone")}
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  {(["natural", "brief", "warm"] as const).map((key) => (
                    <option key={key}>{tTone(key)}</option>
                  ))}
                </select>
              </label>
              <button
                className="primary generate"
                disabled={!source.trim() || !selectedTemplate}
                // Replacing text already in the reply asks first; the other fields stay.
                onClick={() => (body.trim() ? setPendingChange({ run: applyTemplate, replace: true }) : applyTemplate())}
              >
                {t("apply")}
              </button>
              {!source.trim() && <p className="muted">{t("needSource")}</p>}
              {!selectedTemplate && <p className="muted">{t("needTemplate")}</p>}
              <p className="muted">{t("aiSoon")}</p>
            </section>

            <section className="draft-section draft-writing" aria-label={t("sectionReply")}>
              <h3>{t("sectionReply")}</h3>
              {notice && (
                <p className="notice error" role="alert">
                  {notice}
                </p>
              )}
              <div className="draft-output">
                <span>{mode || t("editableDraft")}</span>
                <p className="draft-save-status" role="status">
                  {dirty ? t("unsavedChanges") : t("newDraft")}
                </p>
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
          </section>
        </div>
        <section className="surface padded section-gap saved-drafts">
          <div className="section-header">
            <div>
              <span>{tEyebrow("savedDrafts")}</span>
              <h2>{t("savedTitle")}</h2>
            </div>
          </div>
          {data.drafts
            .filter((d) => !d.archived)
            .map((d) => (
              <div className="saved-row" key={d.id}>
                <button className="text-button" onClick={() => requestChange(() => load(d))}>
                  {d.subject} · {labels.projectType(d.projectType)}
                </button>
              </div>
            ))}
          {!data.drafts.filter((d) => !d.archived).length && <p className="empty">{t("savedEmpty")}</p>}
        </section>
      </fieldset>
      {pendingChange && (
        <Modal title={t("confirmTitle")} onClose={() => setPendingChange(null)}>
          <p>{pendingChange.replace ? t("replaceMessage") : t("leaveMessage")}</p>
          <footer className="modal-actions">
            <button className="secondary" onClick={() => setPendingChange(null)}>
              {tEditor("keepEditing")}
            </button>
            <button
              className="primary"
              onClick={() => {
                const { run } = pendingChange;
                setPendingChange(null);
                run();
              }}
            >
              {pendingChange.replace ? t("confirmReplace") : tEditor("discard")}
            </button>
          </footer>
        </Modal>
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}
