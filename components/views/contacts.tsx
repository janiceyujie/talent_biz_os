"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { loadProject } from "@/components/app/project-detail";
import { projectRecord, RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archiveContact } from "@/lib/actions/contacts";
import { useLabels } from "@/lib/i18n/labels";
import { contactRoles } from "@/lib/types";
import { EditOrganization } from "./organization";
import { OrganizationDuplicates } from "./organization-duplicates";

/** People and organisations (decision 0012), one at a time: `?view=organizations` shows organisations. */
export function ContactsView() {
  const address = useSearchParams();
  const [view, setView] = useState<"people" | "organizations">(address.get("view") === "organizations" ? "organizations" : "people");
  const show = (next: "people" | "organizations") => {
    setView(next);
    window.history.replaceState(null, "", next === "organizations" ? "?view=organizations" : window.location.pathname);
  };
  const t = useTranslations("contacts");
  return (
    <>
      <div className="view-switch" role="group" aria-label={t("views")}>
        <button aria-pressed={view === "people"} onClick={() => show("people")}>
          {t("viewPeople")}
        </button>
        <button aria-pressed={view === "organizations"} onClick={() => show("organizations")}>
          {t("viewOrganizations")}
        </button>
      </div>
      {view === "people" ? <PeopleView /> : <OrganizationsView />}
    </>
  );
}

function PeopleView() {
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
            {/* Where they work: the organisation, linked, else the company as typed. */}
            {(() => {
              const org = data.organizations.find((o) => o.id === c.organizationId);
              return org ? (
                <Link className="contact-org" href={`/contacts/organizations/${org.id}`}>
                  {org.name}
                </Link>
              ) : (
                <p className="muted">{c.company || t("noCompany")}</p>
              );
            })()}
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

/** Every organisation, with its people at a glance; each opens its own page. */
function OrganizationsView() {
  const data = useAppData();
  const t = useTranslations("contacts");
  const tOrg = useTranslations("organizations");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const visible = data.organizations.filter((o) => o.archived === archived && o.name.toLowerCase().includes(q.toLowerCase()));
  const peopleAt = (id: string) => data.contacts.filter((c) => c.organizationId === id && !c.archived);

  return (
    <>
      <div className="toolbar wrap">
        <input aria-label={t("searchOrganizations")} placeholder={t("searchOrganizations")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setCreating(true)}>
          {tOrg("newTitle")}
        </button>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("archivedOnly")}
        </label>
      </div>
      {!archived && <OrganizationDuplicates />}
      <ul className="org-list">
        {visible.map((o) => {
          const people = peopleAt(o.id);
          return (
            <li key={o.id}>
              <Link className="surface org-row" href={`/contacts/organizations/${o.id}`}>
                <strong>{o.name}</strong>
                <span className="muted">{people.length ? people.map((c) => c.name).join("、") : t("noPeopleYet")}</span>
                <small>{t("peopleCount", { count: people.length })}</small>
              </Link>
            </li>
          );
        })}
      </ul>
      {!visible.length && <p className="surface empty">{t("noOrganizations")}</p>}
      {creating && <EditOrganization onDone={() => setCreating(false)} onSaved={(id) => router.push(`/contacts/organizations/${id}`)} />}
    </>
  );
}
