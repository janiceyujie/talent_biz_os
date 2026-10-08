"use client";

import { Mail, Phone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Combobox } from "@/components/app/combobox";
import { ContactPicker, type ContactValue } from "@/components/app/contact-picker";
import { Modal } from "@/components/app/modal";
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
type Rename = { kind: "person" | "organization"; id: string; value: string };

/**
 * Who the project is with (decision 0012): its organisations, the client
 * first, each with its role and its people; then anyone whose organisation
 * isn't on it. People are reachable in a tap (email, phone). The first
 * organisation added becomes the client, the first person the main contact,
 * the one intake matches incoming messages to.
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
  const [rename, setRename] = useState<Rename | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));
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

  const personRow = (p: Person) => (
    <li key={p.contact.id}>
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
          {!p.main && (
            <button role="menuitem" disabled={pending} onClick={() => run(() => setMainContact(project.id, p.contact.id))}>
              {t("makeMain")}
            </button>
          )}
          {!p.main && (
            <button role="menuitem" onClick={() => setRename({ kind: "person", id: p.contact.id, value: p.label })}>
              {t("editRole")}
            </button>
          )}
          <button role="menuitem" disabled={pending} onClick={() => run(() => removeProjectPerson(project.id, p.contact.id))}>
            {t("remove")}
          </button>
        </MoreMenu>
      )}
    </li>
  );

  return (
    <DealCard
      title={t("title")}
      action={
        live && (
          <div className="card-actions">
            <button className="text-button with-icon" onClick={() => setAdding({ kind: "organization" })}>
              <Plus size={14} aria-hidden="true" />
              {t("addOrg")}
            </button>
            <button className="text-button with-icon" onClick={() => setAdding({ kind: "person", organizationId: "" })}>
              <Plus size={14} aria-hidden="true" />
              {t("add")}
            </button>
          </div>
        )
      }
    >
      {/* Before any organisation is on it, the project's partner text still says who it's with. */}
      {groups.length === 0 && <p className="partner-org">{project.counterparty}</p>}
      {groups.map((g) => (
        <section key={g.organizationId} className="org-group">
          <header className="org-header">
            <strong>{g.name}</strong>
            {g.primary && <span className="person-role main">{t("client")}</span>}
            {g.role && <span className="person-role">{g.role}</span>}
            {live && (
              <span className="org-actions">
                <button className="text-button with-icon" aria-label={t("addTo", { name: g.name })} onClick={() => setAdding({ kind: "person", organizationId: g.organizationId })}>
                  <Plus size={14} aria-hidden="true" />
                  {t("person")}
                </button>
                <MoreMenu label={t("more", { name: g.name })}>
                  {!g.primary && (
                    <button role="menuitem" disabled={pending} onClick={() => run(() => setClientOrganization(project.id, g.organizationId))}>
                      {t("makeClient")}
                    </button>
                  )}
                  <button role="menuitem" onClick={() => setRename({ kind: "organization", id: g.organizationId, value: g.role })}>
                    {t("editRole")}
                  </button>
                  {!g.primary && (
                    <button role="menuitem" disabled={pending} onClick={() => run(() => removeProjectOrganization(project.id, g.organizationId))}>
                      {t("remove")}
                    </button>
                  )}
                </MoreMenu>
              </span>
            )}
          </header>
          {g.people.length > 0 ? <ul className="people-list">{g.people.map(personRow)}</ul> : <p className="muted org-empty">{t("noPeopleHere")}</p>}
        </section>
      ))}
      {others.length > 0 && (
        <section className="org-group">
          {groups.length > 0 && (
            <header className="org-header">
              <strong className="muted">{t("others")}</strong>
            </header>
          )}
          <ul className="people-list">{others.map(personRow)}</ul>
        </section>
      )}
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
      {rename && (
        <Modal title={t("editRole")} onClose={() => setRename(null)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const { kind, id, value } = rename;
              startTransition(async () => {
                const failure =
                  kind === "person" ? await setProjectPersonLabel(project.id, id, value) : await setProjectOrganizationRole(project.id, id, value);
                setError(failure);
                if (!failure) setRename(null);
              });
            }}
          >
            <label>
              {t("role")}
              <input
                autoFocus
                maxLength={60}
                placeholder={t(rename.kind === "person" ? "rolePlaceholder" : "orgRolePlaceholder")}
                value={rename.value}
                onChange={(e) => setRename({ ...rename, value: e.target.value })}
              />
            </label>
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setRename(null)}>
                {t("cancel")}
              </button>
              <button type="submit" className="primary" disabled={pending}>
                {t("save")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </DealCard>
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
  // That organisation's people first, then everyone else.
  const contacts = data.contacts
    .filter((c) => !taken.includes(c.id))
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
        <ContactPicker label={t("person")} contacts={contacts} value={value} onChange={setValue} />
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

const NEW_ORG = "new-organization";

/** Add an organisation: search existing ones or type a new name, and its role here. The first becomes the client. */
function AddOrganization({ project, taken, onDone }: { project: Project; taken: string[]; onDone: () => void }) {
  const data = useAppData();
  const t = useTranslations("projects.people");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("");
  const [role, setRole] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const typed = name.trim();
  const query = typed.toLowerCase();
  const matches = data.organizations
    .filter((o) => !o.archived && !taken.includes(o.id))
    .filter((o) => !query || o.name.toLowerCase().includes(query))
    .slice(0, 8);
  const exact = matches.some((o) => o.name.toLowerCase() === query);
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
              organizationId: picked,
              newOrganization: picked ? null : { name: typed },
              role,
            });
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <Combobox
          label={t("org")}
          required
          placeholder={t("orgPlaceholder")}
          text={name}
          onText={(text) => {
            setName(text);
            setPicked("");
          }}
          explicitPick
          options={[
            ...matches.map((o) => ({ id: o.id, primary: o.name })),
            ...(typed && !exact ? [{ id: NEW_ORG, primary: t("newOrg", { name: typed }) }] : []),
          ]}
          onPick={(id) => {
            if (id === NEW_ORG) return setPicked("");
            setPicked(id);
            setName(data.organizations.find((o) => o.id === id)?.name ?? "");
          }}
          hint={picked ? t("orgExisting") : typed ? t("orgNew") : undefined}
        />
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
          <button type="submit" className="primary" disabled={pending || !typed}>
            {t("addButton")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
