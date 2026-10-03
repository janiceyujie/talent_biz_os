"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { useLabels } from "@/lib/i18n/labels";
import type { Contact } from "@/lib/types";

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
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = name.trim().toLowerCase();
  const matches = contacts
    .filter((c) => !c.archived || c.id === contactId)
    .filter((c) => !query || `${c.name} ${c.company}`.toLowerCase().includes(query))
    .slice(0, 8);
  const linked = contacts.find((c) => c.id === contactId);
  const pick = (c: Contact) => {
    onChange({ name: c.name, contactId: c.id });
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (matches.length ? (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape" && open) {
      // The first Escape closes the list, not the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <div className="searchable-field">
      <label>
        {label}
        <span className="searchable-input">
          <input
            role="combobox"
            aria-label={label}
            aria-expanded={open && matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
            maxLength={200}
            value={name}
            onChange={(e) => {
              onChange({ name: e.target.value, contactId: "" });
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKey}
          />
          {name && (
            <button
              type="button"
              className="searchable-clear"
              aria-label={t("contactClear")}
              onClick={() => onChange({ name: "", contactId: "" })}
            >
              ×
            </button>
          )}
        </span>
      </label>
      {open && matches.length > 0 && (
        <div className="searchable-menu">
          <ul id={listId} role="listbox">
            {matches.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === active}
                // Before blur, so the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
              >
                <strong>{c.name}</strong>
                <small>{[c.company, labels.contactRole(c.role)].filter(Boolean).join(" · ")}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <small className="muted">{linked ? t("contactLinked", { name: linked.name }) : name ? t("contactUnlinked") : t("contactHint")}</small>
    </div>
  );
}
