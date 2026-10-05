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
const KEEP = "keep-typed-name";

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
      explicitPick
      options={[
        ...matches.map((c) => ({
          id: c.id,
          primary: c.name,
          secondary: [c.company, labels.contactRole(c.role)].filter(Boolean).join(" · "),
        })),
        // Typed text can stay as this project's own name even when a contact partly matches.
        ...(name.trim() && !(linked && linked.name === name) ? [{ id: KEEP, primary: t("contactKeep", { name: name.trim() }), secondary: t("contactKeepNote") }] : []),
      ]}
      onPick={(id) => {
        if (id === KEEP) return onChange({ name: name.trim(), contactId: "" });
        const c = contacts.find((x) => x.id === id)!;
        onChange({ name: c.name, contactId: c.id });
      }}
      clearLabel={t("contactClear")}
      onClear={() => onChange({ name: "", contactId: "" })}
      hint={
        linked
          ? t("contactLinked", { name: [linked.name, linked.company || labels.contactRole(linked.role)].filter(Boolean).join(" · ") })
          : name
            ? t("contactUnlinked")
            : t("contactHint")
      }
    />
  );
}
