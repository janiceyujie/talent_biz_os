"use client";

import { ArrowLeft, Mail, Phone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ContactPicker, type ContactValue } from "@/components/app/contact-picker";
import { Modal } from "@/components/app/modal";
import { addOrganizationPerson, archiveOrganization, removeOrganizationPerson, saveOrganization } from "@/lib/actions/organizations";
import type { OrganizationProject } from "@/lib/data/organizations";
import { paymentCash, paymentTotal } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { DealCard } from "./deal-card";
import { DistinctFrom } from "./organization-duplicates";
import { MoreMenu } from "./more-menu";

/**
 * One organisation (decision 0012): its people, every project it's on with its
 * role there, and the money on the projects it's the client of.
 */
export function OrganizationView({ id, projects }: { id: string; projects: OrganizationProject[] }) {
  const data = useAppData();
  const t = useTranslations("organizations");
  const labels = useLabels();
  const money = useMoney();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));

  const org = data.organizations.find((o) => o.id === id);
  if (!org) return <p className="notice">{t("missing")}</p>;
  const people = data.contacts.filter((c) => c.organizationId === id);
  const clientOf = new Set(projects.filter((p) => p.primary).map((p) => p.projectId));
  const payments = data.payments.filter((p) => p.projectId && clientOf.has(p.projectId) && p.direction === "in" && !p.voided && p.status !== "cancelled");
  const received = payments.reduce((n, p) => n + paymentCash(p), 0);
  const outstanding = payments.filter((p) => p.status === "expected").reduce((n, p) => n + paymentTotal(p), 0);
  const titleOf = (projectId: string | null) => projects.find((p) => p.projectId === projectId)?.title ?? "";

  return (
    <div className="org-page">
      <Link className="text-button with-icon back-link" href="/contacts?view=organizations">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("back")}
      </Link>
      <header className="org-page-header">
        <div>
          <h2>{org.name}</h2>
          {org.archived && <span className="person-role">{t("archived")}</span>}
          {org.notes && <p className="muted prewrap">{org.notes}</p>}
        </div>
        <div className="deal-header-actions">
          <button className="primary" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <MoreMenu label={t("more")}>
            <button role="menuitem" disabled={pending} onClick={() => run(() => archiveOrganization(id, !org.archived))}>
              {org.archived ? t("restore") : t("archive")}
            </button>
          </MoreMenu>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <div className="deal-cards">
        <DealCard
          title={t("people", { count: people.length })}
          action={
            <button className="text-button with-icon" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden="true" />
              {t("addPerson")}
            </button>
          }
        >
          {people.length > 0 ? (
            <ul className="people-list">
              {people.map((c) => (
                <li key={c.id}>
                  <div className="person-who">
                    <strong>{c.name}</strong>
                    <span className="person-role">{labels.contactRole(c.role)}</span>
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
                  <MoreMenu label={t("personMore", { name: c.name })}>
                    <button role="menuitem" className="danger-text" onClick={() => setLeaving({ id: c.id, name: c.name })}>
                      {t("removePerson")}
                    </button>
                  </MoreMenu>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("noPeople")}</p>
          )}
        </DealCard>

        <DealCard title={t("projects", { count: projects.length })}>
          {projects.length > 0 ? (
            <ul className="deal-records">
              {projects.map((p) => (
                <li key={p.projectId}>
                  <Link className="deal-record" href={`/projects?phase=all&id=${p.projectId}`}>
                    <span>{p.title}</span>
                    {p.primary && <span className="person-role main">{t("client")}</span>}
                    {p.role && <span className="person-role">{p.role}</span>}
                    <small>{p.archived ? t("archived") : labels.stage(p.stage)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("noProjects")}</p>
          )}
        </DealCard>

        {/* Money comes from the projects it's the client of: the deals it pays for. */}
        {clientOf.size > 0 && (
          <DealCard title={t("money")}>
            <dl className="deal-facts">
              <div>
                <dt>{t("received")}</dt>
                <dd>{money(received)}</dd>
              </div>
              <div>
                <dt>{t("outstanding")}</dt>
                <dd className={outstanding > 0 ? "owed" : ""}>{money(outstanding)}</dd>
              </div>
            </dl>
            {payments.length > 0 && (
              <ul className="deal-records org-payments">
                {payments.map((p) => (
                  <li key={p.id} className="deal-record">
                    <span>{p.label}</span>
                    <small>{titleOf(p.projectId)}</small>
                    <small>{labels.paymentStatus(p)}</small>
                    <strong>{money(paymentTotal(p))}</strong>
                  </li>
                ))}
              </ul>
            )}
          </DealCard>
        )}
      </div>

      <DistinctFrom organizationId={id} />
      {leaving && (
        <ConfirmDialog
          title={t("removePersonTitle", { name: leaving.name, org: org.name })}
          confirmLabel={t("removePerson")}
          pending={pending}
          onClose={() => setLeaving(null)}
          onConfirm={() =>
            startTransition(async () => {
              const failure = await removeOrganizationPerson(leaving.id);
              setError(failure);
              if (!failure) setLeaving(null);
            })
          }
        >
          <p>{t("removePersonBody")}</p>
        </ConfirmDialog>
      )}
      {editing && <EditOrganization id={id} name={org.name} notes={org.notes} onDone={() => setEditing(false)} />}
      {adding && <AddPerson organizationId={id} taken={people.map((c) => c.id)} onDone={() => setAdding(false)} />}
    </div>
  );
}

/** Create or rename an organisation, with notes. `onSaved` gets its id (to open a new one). */
export function EditOrganization({
  id = "",
  name = "",
  notes = "",
  onDone,
  onSaved,
}: {
  id?: string;
  name?: string;
  notes?: string;
  onDone: () => void;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations("organizations");
  const [values, setValues] = useState({ name, notes });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={id ? t("editTitle") : t("newTitle")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await saveOrganization({ id, ...values });
            if ("error" in result) return setError(result.error);
            onSaved?.(result.id);
            onDone();
          });
        }}
      >
        <label>
          {t("name")} *
          <input autoFocus required maxLength={200} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </label>
        <label>
          {t("notes")}
          <textarea rows={3} maxLength={10000} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
        </label>
        {id && <p className="muted">{t("renameNote")}</p>}
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

/** Someone works here: pick a contact (they move here) or add a new one. */
function AddPerson({ organizationId, taken, onDone }: { organizationId: string; taken: string[]; onDone: () => void }) {
  const data = useAppData();
  const t = useTranslations("organizations");
  const [value, setValue] = useState<ContactValue>({ name: "", contactId: "", newContact: null });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t("addPerson")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const newContact = value.contactId ? null : { email: "", phone: "", ...value.newContact, name: value.name.trim() };
          startTransition(async () => {
            const failure = await addOrganizationPerson({ organizationId, contactId: value.contactId, newContact });
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <ContactPicker
          label={t("person")}
          // Only contacts without an organisation: adding them here makes them part of it. Someone who works elsewhere isn't moved here as a side effect.
          contacts={data.contacts.filter((c) => !taken.includes(c.id) && !c.organizationId)}
          value={value}
          onChange={setValue}
          newAt={data.organizations.find((o) => o.id === organizationId)?.name}
        />
        <p className="muted">{t("moveNote")}</p>
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
            {t("add")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
