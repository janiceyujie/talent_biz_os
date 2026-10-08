"use client";

import { Archive, FolderOpen, Funnel, Mail, Phone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { PageHeader } from "@/components/app/page-header";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archiveContact } from "@/lib/actions/contacts";
import { phaseOf } from "@/lib/domain/phases";
import { useLabels } from "@/lib/i18n/labels";
import { contactRoles, type Contact, type Stage } from "@/lib/types";
import { MoreMenu } from "./more-menu";
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
  const tOrg = useTranslations("organizations");
  // Adding is the page's own action, beside the title as on Projects: a contact or an organisation, by view.
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader titleKey="contacts">
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" />
          {view === "people" ? t("new") : tOrg("newTitle")}
        </button>
      </PageHeader>
      <div className="view-switch" role="group" aria-label={t("views")}>
        <button aria-pressed={view === "people"} onClick={() => show("people")}>
          {t("viewPeople")}
        </button>
        <button aria-pressed={view === "organizations"} onClick={() => show("organizations")}>
          {t("viewOrganizations")}
        </button>
      </div>
      {view === "people" ? (
        <PeopleView adding={adding} doneAdding={() => setAdding(false)} />
      ) : (
        <OrganizationsView adding={adding} doneAdding={() => setAdding(false)} />
      )}
    </>
  );
}

const SHOWN_PROJECTS = 3; // on a contact's card before "N more"
// Done with: closed (the last step of settlement), declined, or cancelled.
const finished = (stage: Stage) => stage === "closed" || phaseOf(stage) === "ended";

function PeopleView({ adding, doneAdding }: { adding: boolean; doneAdding: () => void }) {
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
  const editAt = (c: Contact, focus?: string) => setEditor({ kind: "contact", item: toRecord(c), focus });
  // Their projects: as main contact or among a project's people. Ongoing first, then the latest
  // (the list comes newest first); a few on the card, the rest a click away.
  const onProjects = new Map<string, Set<string>>();
  for (const { projectId, contactId } of data.projectPeople) onProjects.set(contactId, (onProjects.get(contactId) ?? new Set()).add(projectId));
  const projectsOf = (c: Contact) =>
    data.projects
      .filter((p) => !p.archived && (p.counterpartyId === c.id || onProjects.get(c.id)?.has(p.id)))
      .sort((a, b) => Number(finished(a.stage)) - Number(finished(b.stage)));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleProjects = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <ListControls
        search={q}
        onSearch={setQ}
        searchLabel={t("search")}
        searchPlaceholder={t("searchPlaceholder")}
        archived={archived}
        onArchived={setArchived}
      >
        {/* A funnel says it narrows the list, as on Projects; tinted while a type is chosen. */}
        <label className={`type-filter ${role !== "all" ? "active" : ""}`}>
          <Funnel size={16} aria-hidden="true" />
          <select aria-label={t("roleFilter")} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">{t("allTypes")}</option>
            {contactRoles.map((r) => (
              <option key={r} value={r}>
                {labels.contactRole(r)}
              </option>
            ))}
          </select>
        </label>
      </ListControls>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="contact-grid">
        {visible.map((c) => {
          const org = data.organizations.find((o) => o.id === c.organizationId);
          const projects = projectsOf(c);
          const open = expanded.has(c.id);
          // What's not filled in yet, each a chip that opens the form at it, rather than a line saying it's missing.
          const missing = [
            !org && !c.company && (["organizationName", t("addCompany")] as const),
            !c.email && (["email", t("addEmail")] as const),
            !c.phone && (["phone", t("addPhone")] as const),
          ].filter((m) => !!m);
          return (
            <article className="surface contact-card" key={c.id}>
              <header className="contact-head">
                <div className="contact-avatar" aria-hidden="true">
                  {c.name.slice(0, 1)}
                </div>
                <div className="contact-who">
                  <h2>
                    {c.name}
                    <span className="person-role">{labels.contactRole(c.role)}</span>
                  </h2>
                  {/* Where they work: the organisation, linked, else the company as typed. */}
                  {org ? (
                    <Link href={`/contacts/organizations/${org.id}`}>{org.name}</Link>
                  ) : (
                    c.company && <p>{c.company}</p>
                  )}
                </div>
                <MoreMenu label={t("more", { name: c.name })}>
                  <button role="menuitem" onClick={() => editAt(c)}>
                    {t("edit")}
                  </button>
                  <button
                    role="menuitem"
                    disabled={pending}
                    onClick={() => startTransition(async () => setError(await archiveContact(c.id, !c.archived)))}
                  >
                    {c.archived ? t("restore") : t("archive")}
                  </button>
                </MoreMenu>
              </header>
              {(c.email || c.phone) && (
                <div className="person-reach contact-reach">
                  {c.email && (
                    <a href={`mailto:${c.email}`}>
                      <Mail size={14} aria-hidden="true" />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`}>
                      <Phone size={14} aria-hidden="true" />
                      {c.phone}
                    </a>
                  )}
                </div>
              )}
              {missing.length > 0 && !c.archived && (
                <div className="contact-missing">
                  {missing.map(([field, label]) => (
                    <button key={field} className="add-chip" onClick={() => editAt(c, field)}>
                      <Plus size={13} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {c.notes && <p className="contact-notes prewrap">{c.notes}</p>}
              {projects.length > 0 && (
                <div className="contact-projects">
                  <small>
                    {t("related")} · {projects.length}
                  </small>
                  <ul>
                    {(open ? projects : projects.slice(0, SHOWN_PROJECTS)).map((p) => (
                      <li key={p.id}>
                        <Link href={`/projects?id=${p.id}`} className={finished(p.stage) ? "is-ended" : ""}>
                          <FolderOpen size={14} aria-hidden="true" />
                          <span>{p.title}</span>
                          <small>{labels.stage(p.stage)}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {projects.length > SHOWN_PROJECTS && (
                    <button className="text-button" aria-expanded={open} onClick={() => toggleProjects(c.id)}>
                      {open ? t("showFewer") : t("moreProjects", { count: projects.length - SHOWN_PROJECTS })}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length && archived && <p className="surface empty">{t("archivedEmpty")}</p>}
      {!visible.length && !archived && (
        <div className="surface empty">
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
          <button className="primary" onClick={() => setEditor({ kind: "contact" })}>
            {t("addFirst")}
          </button>
        </div>
      )}
      {(editor || adding) && (
        <RecordEditor
          editor={editor ?? { kind: "contact" }}
          onClose={() => {
            setEditor(null);
            doneAdding();
          }}
        />
      )}
    </>
  );
}

/**
 * Search, filters, and archived, in one row that stays under the top bar while the list scrolls.
 * Archived is a toggle shaped like the controls beside it, with the archive icon as on Projects.
 */
function ListControls({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  archived,
  onArchived,
  children,
}: {
  search: string;
  onSearch: (q: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  archived: boolean;
  onArchived: (archived: boolean) => void;
  children?: ReactNode;
}) {
  const t = useTranslations("contacts");
  return (
    <div className="list-controls">
      <input type="search" aria-label={searchLabel} placeholder={searchPlaceholder} value={search} onChange={(e) => onSearch(e.target.value)} />
      {children}
      <button className={`archive-toggle ${archived ? "active" : ""}`} aria-pressed={archived} onClick={() => onArchived(!archived)}>
        <Archive size={16} aria-hidden="true" />
        {t("archivedOnly")}
      </button>
    </div>
  );
}

/** Every organisation, with its people at a glance; each opens its own page. */
function OrganizationsView({ adding, doneAdding }: { adding: boolean; doneAdding: () => void }) {
  const data = useAppData();
  const t = useTranslations("contacts");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const visible = data.organizations.filter((o) => o.archived === archived && o.name.toLowerCase().includes(q.toLowerCase()));
  const peopleAt = (id: string) => data.contacts.filter((c) => c.organizationId === id && !c.archived);

  return (
    <>
      <ListControls
        search={q}
        onSearch={setQ}
        searchLabel={t("searchOrganizations")}
        searchPlaceholder={t("searchOrganizations")}
        archived={archived}
        onArchived={setArchived}
      />
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
      {adding && <EditOrganization onDone={doneAdding} onSaved={(id) => router.push(`/contacts/organizations/${id}`)} />}
    </>
  );
}
