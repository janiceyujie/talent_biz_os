"use client";

import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLabels } from "@/lib/i18n/labels";
import type { Contact } from "@/lib/types";
import { Combobox } from "./combobox";

/** Who to add to contacts along with the project; the name is the typed partner name. */
export type NewContact = { company: string; email: string; phone: string };

export type ContactValue = { name: string; contactId: string; newContact: NewContact | null };

const CREATE = "create-contact";
const blank: NewContact = { company: "", email: "", phone: "" };

/**
 * A partner name that can link to a contact. Typing searches contacts by name
 * or company; picking one links it (by id). A typed name that isn't a contact
 * stays on this project only, unless "add to contacts" is chosen: then the
 * contact is created when the project is saved, so cancelling leaves nothing
 * behind. Editing a picked name unlinks it, so new text is never tied to the old contact.
 */
export function ContactPicker({
  label,
  contacts,
  value,
  onChange,
}: {
  label: string;
  contacts: Contact[];
  value: ContactValue;
  onChange: (value: ContactValue) => void;
}) {
  const t = useTranslations("editor");
  const labels = useLabels();
  const { name, contactId, newContact } = value;
  const typed = name.trim();
  const query = typed.toLowerCase();
  const matches = contacts
    .filter((c) => !c.archived || c.id === contactId)
    .filter((c) => !query || `${c.name} ${c.company}`.toLowerCase().includes(query))
    .slice(0, 8);
  const linked = contacts.find((c) => c.id === contactId);
  const exact = matches.some((c) => c.name.toLowerCase() === query);
  const setContact = (k: keyof NewContact, v: string) => onChange({ ...value, newContact: { ...newContact!, [k]: v } });

  return (
    <div className="contact-picker">
      <Combobox
        label={label}
        required
        placeholder={t("contactPlaceholder")}
        text={name}
        // Typing keeps an "add to contacts" choice, for the name as it now reads.
        onText={(text) => onChange({ name: text, contactId: "", newContact: text.trim() ? newContact : null })}
        explicitPick
        options={[
          ...matches.map((c) => ({
            id: c.id,
            primary: c.name,
            secondary: [c.company, labels.contactRole(c.role)].filter(Boolean).join(" · "),
          })),
          ...(typed && !linked && !exact && !newContact ? [{ id: CREATE, primary: t("contactCreate", { name: typed }) }] : []),
        ]}
        onPick={(id) => {
          if (id === CREATE) return onChange({ name: typed, contactId: "", newContact: blank });
          const c = contacts.find((x) => x.id === id)!;
          onChange({ name: c.name, contactId: c.id, newContact: null });
        }}
        clearLabel={t("contactClear")}
        onClear={() => onChange({ name: "", contactId: "", newContact: null })}
        hint={
          linked ? (
            <span className="contact-status linked">
              <Check size={14} aria-hidden="true" />
              {[t("contactLinked"), linked.company || labels.contactRole(linked.role)].filter(Boolean).join(" · ")}
            </span>
          ) : typed && !newContact ? (
            <span className="contact-status">
              {t("contactUnlinked")}
              <button type="button" className="text-button" onClick={() => onChange({ ...value, newContact: blank })}>
                <Plus size={14} aria-hidden="true" />
                {t("contactAdd")}
              </button>
            </span>
          ) : undefined
        }
      />
      {newContact && (
        <fieldset className="contact-new">
          <legend>
            {t("contactNewTitle", { name: typed })}
            <button type="button" className="text-button" onClick={() => onChange({ ...value, newContact: null })}>
              {t("contactNewCancel")}
            </button>
          </legend>
          <div className="form-grid">
            <label>
              {t("field.company")}
              <input maxLength={200} value={newContact.company} onChange={(e) => setContact("company", e.target.value)} />
            </label>
            <label>
              {t("field.email")}
              <input type="email" maxLength={200} value={newContact.email} onChange={(e) => setContact("email", e.target.value)} />
            </label>
            <label>
              {t("field.phone")}
              <input type="tel" maxLength={60} value={newContact.phone} onChange={(e) => setContact("phone", e.target.value)} />
            </label>
          </div>
        </fieldset>
      )}
    </div>
  );
}
