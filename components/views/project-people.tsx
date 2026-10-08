"use client";

import { Mail, Phone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { ContactPicker, type ContactValue } from "@/components/app/contact-picker";
import { Modal } from "@/components/app/modal";
import { addProjectPerson, removeProjectPerson, setMainContact, setProjectPersonLabel } from "@/lib/actions/project-people";
import type { Project, ProjectDetail } from "@/lib/types";
import { MoreMenu } from "./more-menu";
import { DealCard } from "./deal-card";

/**
 * Who the project is with: the partner's name, its main contact, and anyone
 * else on it with their role there. Reachable in a tap (email, phone); people
 * are added from contacts or as new contacts, and the first becomes the main
 * contact — the one intake matches incoming messages to.
 */
export function ProjectPeople({ project, people }: { project: Project; people: ProjectDetail["people"] }) {
  const data = useAppData();
  const t = useTranslations("projects.people");
  const [adding, setAdding] = useState(false);
  const [relabel, setRelabel] = useState<{ contactId: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));

  const contactOf = (id: string) => data.contacts.find((c) => c.id === id);
  const rows = [
    ...(project.counterpartyId ? [{ contactId: project.counterpartyId, label: "", main: true }] : []),
    ...people.map((p) => ({ ...p, main: false })),
  ].flatMap((r) => {
    const c = contactOf(r.contactId);
    return c ? [{ ...r, contact: c }] : [];
  });

  return (
    <DealCard
      title={t("title")}
      action={
        !project.archived && (
          <button className="text-button with-icon" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden="true" />
            {t("add")}
          </button>
        )
      }
    >
      <p className="partner-org">{project.counterparty}</p>
      {rows.length > 0 ? (
        <ul className="people-list">
          {rows.map(({ contact: c, label, main }) => (
            <li key={c.id}>
              <div className="person-who">
                <strong>{c.name}</strong>
                {(main || label) && <span className={`person-role ${main ? "main" : ""}`}>{main ? t("main") : label}</span>}
                {c.company && c.company !== project.counterparty && <small>{c.company}</small>}
              </div>
              <div className="person-reach">
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
              {!project.archived && (
                <MoreMenu label={t("more", { name: c.name })}>
                  {!main && (
                    <button role="menuitem" disabled={pending} onClick={() => run(() => setMainContact(project.id, c.id))}>
                      {t("makeMain")}
                    </button>
                  )}
                  {!main && (
                    <button role="menuitem" onClick={() => setRelabel({ contactId: c.id, label })}>
                      {t("editRole")}
                    </button>
                  )}
                  <button role="menuitem" disabled={pending} onClick={() => run(() => removeProjectPerson(project.id, c.id))}>
                    {t("remove")}
                  </button>
                </MoreMenu>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("empty")}</p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <AddPerson
          project={project}
          taken={rows.map((r) => r.contactId)}
          onDone={() => setAdding(false)}
        />
      )}
      {relabel && (
        <Modal title={t("editRole")} onClose={() => setRelabel(null)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const { contactId, label } = relabel;
              startTransition(async () => {
                const failure = await setProjectPersonLabel(project.id, contactId, label);
                setError(failure);
                if (!failure) setRelabel(null);
              });
            }}
          >
            <label>
              {t("role")}
              <input
                autoFocus
                maxLength={60}
                placeholder={t("rolePlaceholder")}
                value={relabel.label}
                onChange={(e) => setRelabel({ ...relabel, label: e.target.value })}
              />
            </label>
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setRelabel(null)}>
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

/** Add someone: pick a contact or type a new name (added to contacts too), and their role here. */
function AddPerson({ project, taken, onDone }: { project: Project; taken: string[]; onDone: () => void }) {
  const data = useAppData();
  const t = useTranslations("projects.people");
  const [value, setValue] = useState<ContactValue>({ name: "", contactId: "", newContact: null });
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The first person on a project becomes its main contact, so a role isn't asked for then.
  const first = !project.counterpartyId;
  const contacts = data.contacts.filter((c) => !taken.includes(c.id));

  return (
    <Modal title={t("addTitle")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          // A typed name that isn't a contact yet is added as one: here, adding a person is the point.
          const newContact = value.contactId ? null : { company: "", email: "", phone: "", ...value.newContact, name: value.name.trim() };
          startTransition(async () => {
            const failure = await addProjectPerson({ projectId: project.id, contactId: value.contactId, newContact, label });
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
