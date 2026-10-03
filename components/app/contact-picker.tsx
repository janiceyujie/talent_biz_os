"use client";

import { useTranslations } from "next-intl";
import { useLabels } from "@/lib/i18n/labels";
import type { Contact } from "@/lib/types";
import { Combobox } from "./combobox";

/**
 * A partner name that can link to a contact. Typing searches contacts by name
 * or company; picking one links it (by id). Typing a new name keeps it as text
 * on this project only — no contact is created, and editing a picked name
 * unlinks it, so new text is never tied to the old contact.
 */
export function ContactPicker({
  label,
  contacts,
  name,
  contactId,
  onChange,
}: {
  label: string;
  contacts: Contact[];
  name: string;
  contactId: string;
  onChange: (value: { name: string; contactId: string }) => void;
}) {
  const t = useTranslations("editor");
  const labels = useLabels();
  const query = name.trim().toLowerCase();
  const matches = contacts
    .filter((c) => !c.archived || c.id === contactId)
    .filter((c) => !query || `${c.name} ${c.company}`.toLowerCase().includes(query))
    .slice(0, 8);
  const linked = contacts.find((c) => c.id === contactId);
  return (
    <Combobox
      label={label}
      text={name}
      onText={(text) => onChange({ name: text, contactId: "" })}
      options={matches.map((c) => ({
        id: c.id,
        primary: c.name,
        secondary: [c.company, labels.contactRole(c.role)].filter(Boolean).join(" · "),
      }))}
      onPick={(id) => {
        const c = contacts.find((x) => x.id === id)!;
        onChange({ name: c.name, contactId: c.id });
      }}
      clearLabel={t("contactClear")}
      onClear={() => onChange({ name: "", contactId: "" })}
      hint={linked ? t("contactLinked", { name: linked.name }) : name ? t("contactUnlinked") : t("contactHint")}
    />
  );
}
