"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { loadProject } from "@/components/app/project-detail";
import { projectRecord, RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archiveContact } from "@/lib/actions/contacts";
import { useLabels } from "@/lib/i18n/labels";
import { contactRoles } from "@/lib/types";

export function ContactsView() {
  const data = useAppData();
  const t = useTranslations("contacts");
  const labels = useLabels();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [archived, setArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const visible = data.contacts.filter(
    (c) =>
      c.archived === archived &&
      (role === "all" || c.role === role) &&
      `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <div className="toolbar wrap">
        <input aria-label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label={t("roleFilter")} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">{t("all")}</option>
          {contactRoles.map((r) => (
            <option key={r} value={r}>
              {labels.contactRole(r)}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => setEditor({ kind: "contact" })}>
          {t("new")}
        </button>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("archivedOnly")}
        </label>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="contact-grid">
        {visible.map((c) => (
          <article className="surface contact-card" key={c.id}>
            <div className="contact-avatar">{c.name.slice(0, 1)}</div>
            <span className="category">{labels.contactRole(c.role)}</span>
            <h2>{c.name}</h2>
            <p className="muted">{c.company || t("noCompany")}</p>
            <p>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : t("noEmail")}</p>
            <p>{c.phone || t("noPhone")}</p>
            <p className="prewrap">{c.notes}</p>
            <div className="related-deals">
              <small>{t("related")}</small>
              {data.projects
                .filter((p) => !p.archived && p.counterpartyId === c.id)
                .map((p) => (
                  // The editor needs the full project (details, notes): fetched first.
                  <button className="text-button" key={p.id} onClick={() => loadProject(p).then((full) => setEditor({ kind: "project", item: projectRecord(full) }))}>
                    {p.title}
                  </button>
                ))}
            </div>
            <div className="row-actions">
              <button className="secondary" onClick={() => setEditor({ kind: "contact", item: toRecord(c) })}>
                {t("edit")}
              </button>
              <button
                className="text-button"
                disabled={pending}
                onClick={() => startTransition(async () => setError(await archiveContact(c.id, !c.archived)))}
              >
                {c.archived ? t("restore") : t("archive")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="surface empty">
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
          <button className="primary" onClick={() => setEditor({ kind: "contact" })}>
            {t("addFirst")}
          </button>
        </div>
      )}
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
