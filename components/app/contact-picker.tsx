"use client";

import { Check, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLabels } from "@/lib/i18n/labels";
import { useAppData } from "./app-data";
import type { Contact } from "@/lib/types";
import { Combobox } from "./combobox";

/** Who to add to contacts along with the project; the name is the typed partner name. */
export type NewContact = { email: string; phone: string };

export type ContactValue = { name: string; contactId: string; newContact: NewContact | null };

const CREATE = "create-contact";
const blank: NewContact = { email: "", phone: "" };

/**
 * A person, picked from contacts or typed new. Typing searches contacts by
 * name, company, or organisation; picking one links it (by id). A typed name
 * that isn't a contact is added as one when the form is saved (so cancelling
 * leaves nothing behind), with an email and phone if given. Editing a picked
 * name unlinks it, so new text is never tied to the old contact.
 */
export function ContactPicker({
  label,
  contacts,
  value,
  onChange,
  required = true,
  newAt,
}: {
  label: string;
  contacts: Contact[];
  value: ContactValue;
  onChange: (value: ContactValue) => void;
  required?: boolean;
  /** Where a typed new person will work (an organisation's name), for the hint. */
  newAt?: string;
}) {
  const t = useTranslations("editor");
  const data = useAppData();
  const orgOf = (c: Contact) => data.organizations.find((o) => o.id === c.organizationId)?.name || c.company;
  const labels = useLabels();
  const { name, contactId, newContact } = value;
  const typed = name.trim();
  const query = typed.toLowerCase();
  const matches = contacts
    .filter((c) => !c.archived || c.id === contactId)
    .filter((c) => !query || `${c.name} ${c.company} ${orgOf(c)}`.toLowerCase().includes(query))
    .slice(0, 8);
  const linked = contacts.find((c) => c.id === contactId);
  const exact = matches.some((c) => c.name.toLowerCase() === query);
  const setContact = (k: keyof NewContact, v: string) => onChange({ ...value, newContact: { ...(newContact ?? blank), [k]: v } });

  // Someone with exactly this name already exists: offer them, so typing doesn't make a duplicate,
  // or say they're already here (left out of `contacts`, e.g. already on the project).
  const sameName = !linked && typed ? data.contacts.find((c) => c.name.trim().toLowerCase() === query) : undefined;
  const offerable = sameName && contacts.some((c) => c.id === sameName.id);
  const willCreate = typed && !linked;

  return (
    <div className="contact-picker">
      <Combobox
        label={label}
        required={required}
        placeholder={t("contactPlaceholder")}
        text={name}
        // A typed name is a new contact; its details are kept while the name is edited.
        onText={(text) => onChange({ name: text, contactId: "", newContact: text.trim() ? (newContact ?? blank) : null })}
        explicitPick
        options={[
          ...matches.map((c) => ({
            id: c.id,
            primary: c.name,
            secondary: [orgOf(c), labels.contactRole(c.role)].filter(Boolean).join(" · "),
          })),
          ...(typed && !linked && !exact ? [{ id: CREATE, primary: t("contactCreate", { name: typed }) }] : []),
        ]}
        onPick={(id) => {
          if (id === CREATE) return onChange({ name: typed, contactId: "", newContact: newContact ?? blank });
          const c = contacts.find((x) => x.id === id)!;
          onChange({ name: c.name, contactId: c.id, newContact: null });
        }}
        clearLabel={t("contactClear")}
        onClear={() => onChange({ name: "", contactId: "", newContact: null })}
        hint={
          linked ? (
            <span className="contact-status linked">
              <Check size={14} aria-hidden="true" />
              {[t("contactLinked"), orgOf(linked) || labels.contactRole(linked.role)].filter(Boolean).join(" · ")}
            </span>
          ) : sameName ? (
            <span className="contact-status warn">
              {offerable
                ? t("contactSameName", { name: sameName.name })
                : newAt && orgOf(sameName) && orgOf(sameName) !== newAt
                  ? t("contactSameNameElsewhere", { name: sameName.name, org: orgOf(sameName) })
                  : t("contactAlreadyHere", { name: sameName.name })}
              {offerable && (
                <button type="button" className="text-button" onClick={() => onChange({ name: sameName.name, contactId: sameName.id, newContact: null })}>
                  {t("contactUseExisting")}
                </button>
              )}
            </span>
          ) : willCreate ? (
            <span className="contact-status new">
              <UserPlus size={14} aria-hidden="true" />
              {newAt ? t("contactWillCreateAt", { name: typed, org: newAt }) : t("contactWillCreate", { name: typed })}
            </span>
          ) : undefined
        }
      />
      {/* A new person: their details right here, optional. */}
      {willCreate && !sameName && (
        <fieldset className="contact-new">
          <legend>{t("contactDetails")}</legend>
          <div className="form-grid">
            <label>
              {t("field.email")}
              <input type="email" maxLength={200} value={newContact?.email ?? ""} onChange={(e) => setContact("email", e.target.value)} />
            </label>
            <label>
              {t("field.phone")}
              <input type="tel" maxLength={60} value={newContact?.phone ?? ""} onChange={(e) => setContact("phone", e.target.value)} />
            </label>
          </div>
        </fieldset>
      )}
    </div>
  );
}
