"use client";

import { Building2, ChevronRight, Mail, Phone, Plus, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ContactPicker, type ContactValue } from "@/components/app/contact-picker";
import { Modal } from "@/components/app/modal";
import { OrganizationPicker, type OrganizationValue } from "@/components/app/organization-picker";
import { toRecord } from "@/components/app/record-editor";
import { saveContact } from "@/lib/actions/contacts";
import {
  addProjectOrganization,
  addProjectPerson,
  removeProjectOrganization,
  removeProjectPerson,
  setClientOrganization,
  setMainContact,
  setProjectOrganizationRole,
  setProjectPersonLabel,
} from "@/lib/actions/project-people";
import type { Contact, Project, ProjectDetail } from "@/lib/types";
import { DealCard } from "./deal-card";
import { MoreMenu } from "./more-menu";

type Person = { contact: Contact; label: string; main: boolean };
type Removal = { kind: "person" | "organization"; id: string; name: string };

const OTHERS = "others"; // the group of people whose organisation isn't on the project
const OPEN_ALL_UP_TO = 2; // with more organisations than this, only the client starts open
const SUMMARY_NAMES = 2; // names a folded group shows before "+N"

/**
 * Who the project is with (decision 0012): its organisations, the client
 * first, each a foldable group with its role and its people; then anyone
 * whose organisation isn't on it. An organisation reads as a header (an icon,
 * a tinted row, a count); its people sit inside it. Folded, a group shows who
 * is in it. People are reachable in a tap and editable here (name, email,
 * phone, role on the project); removing someone or an organisation asks first.
 */
export function ProjectPeople({
  project,
  people,
  organizations,
}: {
  project: Project;
  people: ProjectDetail["people"];
  organizations: ProjectDetail["organizations"];
}) {
  const data = useAppData();
  const t = useTranslations("projects.people");
  const [adding, setAdding] = useState<{ kind: "person"; organizationId: string } | { kind: "organization" } | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [orgRole, setOrgRole] = useState<{ id: string; value: string } | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>, after?: () => void) =>
    startTransition(async () => {
      const failure = await action();
      setError(failure);
      if (!failure) after?.();
    });
  const live = !project.archived;

  const everyone: Person[] = [
    ...(project.counterpartyId ? [{ contactId: project.counterpartyId, label: "", main: true }] : []),
    ...people.map((p) => ({ ...p, main: false })),
  ].flatMap((r) => {
    const contact = data.contacts.find((c) => c.id === r.contactId);
    return contact ? [{ contact, label: r.label, main: r.main }] : [];
  });
  const groups = organizations.flatMap((o) => {
    const org = data.organizations.find((x) => x.id === o.organizationId);
    return org ? [{ ...o, name: org.name, people: everyone.filter((p) => p.contact.organizationId === o.organizationId) }] : [];
  });
  const onProject = new Set(organizations.map((o) => o.organizationId));
  const others = everyone.filter((p) => !p.contact.organizationId || !onProject.has(p.contact.organizationId));
  const groupIds = [...groups.map((g) => g.organizationId), ...(others.length ? [OTHERS] : [])];

  // Open groups: all of them while there are few; with many, the client's (folding keeps the card short).
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(groups.length <= OPEN_ALL_UP_TO ? groupIds : groups.filter((g) => g.primary).map((g) => g.organizationId)),
  );
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = groupIds.every((id) => open.has(id));

  const personRow = (p: Person) => (
    <li key={p.contact.id}>
      <span className="person-initial" aria-hidden="true">
        {p.contact.name.slice(0, 1)}
      </span>
      <div className="person-who">
        <strong>{p.contact.name}</strong>
        {(p.main || p.label) && <span className={`person-role ${p.main ? "main" : ""}`}>{p.main ? t("main") : p.label}</span>}
      </div>
      <div className="person-reach">
        {p.contact.email && (
          <a href={`mailto:${p.contact.email}`}>
            <Mail size={14} aria-hidden="true" />
            {p.contact.email}
          </a>
        )}
        {p.contact.phone && (
          <a href={`tel:${p.contact.phone}`}>
            <Phone size={14} aria-hidden="true" />
            {p.contact.phone}
          </a>
        )}
      </div>
      {live && (
        <MoreMenu label={t("more", { name: p.contact.name })}>
          <button role="menuitem" onClick={() => setEditingPerson(p)}>
            {t("editPerson")}
          </button>
          {!p.main && (
            <button role="menuitem" disabled={pending} onClick={() => run(() => setMainContact(project.id, p.contact.id))}>
              {t("makeMain")}
            </button>
          )}
          <button role="menuitem" className="danger-text" onClick={() => setRemoval({ kind: "person", id: p.contact.id, name: p.contact.name })}>
            {t("remove")}
          </button>
        </MoreMenu>
      )}
    </li>
  );

  /** One foldable group: a header row (what it is, how many), then its people when open. */
  const group = (
    id: string,
    name: string,
    members: Person[],
    extras: { primary?: boolean; role?: string; actions?: ReactNode; icon: "org" | "people" },
  ) => {
    const isOpen = open.has(id);
    return (
      <section key={id} className={`org-group ${isOpen ? "is-open" : ""}`}>
        <header className="org-header">
          <button className="org-toggle" aria-expanded={isOpen} onClick={() => toggle(id)}>
            <ChevronRight className="org-chevron" size={16} aria-hidden="true" />
            {extras.icon === "org" ? <Building2 size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />}
            <strong>{name}</strong>
            {extras.primary && <span className="person-role main">{t("client")}</span>}
            {extras.role && <span className="person-role">{extras.role}</span>}
            <span className="org-count">{t("count", { count: members.length })}</span>
            {/* Folded, say who's inside, so the row still answers "who do we know there?": the main contact
                first and one more by name, then "+N" (all of them on hover, and to screen readers). */}
            {!isOpen && members.length > 0 && (() => {
              const named = [...members].sort((x, y) => Number(y.main) - Number(x.main));
              const all = named.map((m) => m.contact.name).join("、");
              const shown = named.slice(0, SUMMARY_NAMES).map((m) => m.contact.name).join("、");
              const more = named.length - SUMMARY_NAMES;
              return (
                <span className="org-summary" title={all}>
                  <span aria-hidden="true">
                    {shown}
                    {more > 0 && <span className="org-more">{t("more_n", { count: more })}</span>}
                  </span>
                  <span className="sr-only">{all}</span>
                </span>
              );
            })()}
          </button>
          {extras.actions}
        </header>
        {isOpen &&
          (members.length > 0 ? (
            <ul className="people-list">{members.map(personRow)}</ul>
          ) : (
            <p className="muted org-empty">{t("noPeopleHere")}</p>
          ))}
      </section>
    );
  };

  return (
    <DealCard
      title={t("title")}
      action={
        <div className="card-actions">
          {groupIds.length > 1 && (
            <button className="text-button" onClick={() => setOpen(new Set(allOpen ? [] : groupIds))}>
              {allOpen ? t("collapseAll") : t("expandAll")}
            </button>
          )}
          {live && (
            <>
              <button className="text-button with-icon" onClick={() => setAdding({ kind: "organization" })}>
                <Plus size={14} aria-hidden="true" />
                {t("addOrg")}
              </button>
              <button className="text-button with-icon" onClick={() => setAdding({ kind: "person", organizationId: "" })}>
                <Plus size={14} aria-hidden="true" />
                {t("add")}
              </button>
            </>
          )}
        </div>
      }
    >
      {/* Before any organisation is on it, the project's partner text still says who it's with. */}
      {groups.length === 0 && <p className="partner-org">{project.counterparty}</p>}
      <div className="org-groups">
        {groups.map((g) =>
          group(g.organizationId, g.name, g.people, {
            icon: "org",
            primary: g.primary,
            role: g.role,
            actions: live && (
              <span className="org-actions">
                <button
                  className="text-button with-icon"
                  aria-label={t("addTo", { name: g.name })}
                  onClick={() => setAdding({ kind: "person", organizationId: g.organizationId })}
                >
                  <Plus size={14} aria-hidden="true" />
                  {t("person")}
                </button>
                <MoreMenu label={t("more", { name: g.name })}>
                  {!g.primary && (
                    <button role="menuitem" disabled={pending} onClick={() => run(() => setClientOrganization(project.id, g.organizationId))}>
                      {t("makeClient")}
                    </button>
                  )}
                  <button role="menuitem" onClick={() => setOrgRole({ id: g.organizationId, value: g.role })}>
                    {t("editRole")}
                  </button>
                  {!g.primary && (
                    <button role="menuitem" className="danger-text" onClick={() => setRemoval({ kind: "organization", id: g.organizationId, name: g.name })}>
                      {t("remove")}
                    </button>
                  )}
                </MoreMenu>
              </span>
            ),
          }),
        )}
        {others.length > 0 && group(OTHERS, groups.length ? t("others") : t("people"), others, { icon: "people" })}
      </div>
      {groups.length === 0 && others.length === 0 && <p className="muted">{t("empty")}</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {adding?.kind === "person" && (
        <AddPerson project={project} organizationId={adding.organizationId} taken={everyone.map((p) => p.contact.id)} onDone={() => setAdding(null)} />
      )}
      {adding?.kind === "organization" && <AddOrganization project={project} taken={[...onProject]} onDone={() => setAdding(null)} />}
      {editingPerson && <EditPerson project={project} person={editingPerson} onDone={() => setEditingPerson(null)} />}
      {orgRole && (
        <Modal title={t("editRole")} onClose={() => setOrgRole(null)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => setProjectOrganizationRole(project.id, orgRole.id, orgRole.value), () => setOrgRole(null));
            }}
          >
            <label>
              {t("role")}
              <input
                autoFocus
                maxLength={60}
                placeholder={t("orgRolePlaceholder")}
                value={orgRole.value}
                onChange={(e) => setOrgRole({ ...orgRole, value: e.target.value })}
              />
            </label>
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setOrgRole(null)}>
                {t("cancel")}
              </button>
              <button type="submit" className="primary" disabled={pending}>
                {t("save")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {removal && (
        <ConfirmDialog
          title={t(removal.kind === "person" ? "removePersonTitle" : "removeOrgTitle", { name: removal.name })}
          confirmLabel={t("remove")}
          pending={pending}
          onClose={() => setRemoval(null)}
          onConfirm={() =>
            run(
              () => (removal.kind === "person" ? removeProjectPerson(project.id, removal.id) : removeProjectOrganization(project.id, removal.id)),
              () => setRemoval(null),
            )
          }
        >
          <p>{t(removal.kind === "person" ? "removePersonBody" : "removeOrgBody")}</p>
        </ConfirmDialog>
      )}
    </DealCard>
  );
}

/** Edit someone on the project: their contact details (name, email, phone: the same contact everywhere) and their role here. */
function EditPerson({ project, person, onDone }: { project: Project; person: Person; onDone: () => void }) {
  const t = useTranslations("projects.people");
  const [values, setValues] = useState({ name: person.contact.name, email: person.contact.email, phone: person.contact.phone, label: person.label });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof values) => (e: ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });
  return (
    <Modal title={t("editPersonTitle", { name: person.contact.name })} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const failure =
              (await saveContact({ ...toRecord(person.contact), name: values.name, email: values.email, phone: values.phone })) ??
              (!person.main && values.label !== person.label ? await setProjectPersonLabel(project.id, person.contact.id, values.label) : null);
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <label>
          {t("name")} *
          <input autoFocus required maxLength={200} value={values.name} onChange={set("name")} />
        </label>
        <div className="form-grid">
          <label>
            {t("email")}
            <input type="email" maxLength={200} value={values.email} onChange={set("email")} />
          </label>
          <label>
            {t("phone")}
            <input type="tel" maxLength={60} value={values.phone} onChange={set("phone")} />
          </label>
        </div>
        {!person.main && (
          <label>
            {t("role")}
            <input maxLength={60} placeholder={t("rolePlaceholder")} value={values.label} onChange={set("label")} />
          </label>
        )}
        <p className="muted">{t("sameEverywhere")}</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onDone}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending || !values.name.trim()}>
            {t("save")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** Add someone: pick a contact or type a new name (added to contacts too), and their role here. From an organisation's group, they work there. */
function AddPerson({ project, organizationId, taken, onDone }: { project: Project; organizationId: string; taken: string[]; onDone: () => void }) {
  const data = useAppData();
  const t = useTranslations("projects.people");
  const [value, setValue] = useState<ContactValue>({ name: "", contactId: "", newContact: null });
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The first person on a project becomes its main contact, so a role isn't asked for then.
  const first = !project.counterpartyId;
  const org = data.organizations.find((o) => o.id === organizationId);
  // At one organisation: its people and anyone without an organisation (they join it), not people who work elsewhere.
  // From the top of the card: everyone.
  const contacts = data.contacts
    .filter((c) => !taken.includes(c.id))
    .filter((c) => !organizationId || !c.organizationId || c.organizationId === organizationId)
    .sort((a, b) => Number(b.organizationId === organizationId) - Number(a.organizationId === organizationId));

  return (
    <Modal title={org ? t("addToTitle", { name: org.name }) : t("addTitle")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          // A typed name that isn't a contact yet is added as one: here, adding a person is the point.
          const newContact = value.contactId ? null : { company: "", email: "", phone: "", ...value.newContact, name: value.name.trim() };
          startTransition(async () => {
            const failure = await addProjectPerson({ projectId: project.id, contactId: value.contactId, newContact, label, organizationId });
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <ContactPicker label={t("person")} contacts={contacts} value={value} onChange={setValue} newAt={org?.name} />
        {first ? (
          <p className="muted">{t("firstIsMain")}</p>
        ) : (
          <label>
            {t("role")}
            <input maxLength={60} placeholder={t("rolePlaceholder")} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onDone}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending || !value.name.trim()}>
            {t("addButton")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** Add an organisation: search existing ones or type a new name, and its role here. The first becomes the client. */
function AddOrganization({ project, taken, onDone }: { project: Project; taken: string[]; onDone: () => void }) {
  const t = useTranslations("projects.people");
  const [value, setValue] = useState<OrganizationValue>({ name: "", organizationId: "" });
  const [role, setRole] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = taken.length === 0;

  return (
    <Modal title={t("addOrgTitle")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const failure = await addProjectOrganization({
              projectId: project.id,
              organizationId: value.organizationId,
              newOrganization: value.organizationId ? null : { name: value.name.trim() },
              role,
            });
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <OrganizationPicker label={t("org")} value={value} onChange={setValue} exclude={taken} />
        {first && <p className="muted">{t("firstIsClient")}</p>}
        <label>
          {t("role")}
          <input maxLength={60} placeholder={t("orgRolePlaceholder")} value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onDone}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending || !value.name.trim()}>
            {t("addButton")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
