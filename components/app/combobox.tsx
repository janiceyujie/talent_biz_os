"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type ComboOption = { id: string; primary: string; secondary?: string };

/**
 * A text input with a filtered list under it (ARIA combobox). The caller owns
 * the text and the matching; this handles the list, keyboard, and focus.
 * Arrow keys move, Enter picks, the first Escape closes the list (not the
 * dialog around it), and a click picks before the input loses focus.
 */
export function Combobox({
  label,
  required,
  text,
  onText,
  options,
  onPick,
  onBlur,
  clearLabel,
  onClear,
  hint,
}: {
  label: string;
  required?: boolean;
  text: string;
  onText: (text: string) => void;
  options: ComboOption[];
  onPick: (id: string) => void;
  onBlur?: () => void;
  clearLabel?: string;
  onClear?: () => void;
  hint?: ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = open && options.length > 0;
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      setActive((i) => (n ? (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n : 0));
    } else if (e.key === "Enter" && shown && options[active]) {
      e.preventDefault();
      pick(options[active].id);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <div className="searchable-field">
      <label>
        {label}
        {required ? " *" : ""}
        <span className="searchable-input">
          <input
            role="combobox"
            aria-label={label}
            aria-required={required}
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown && options[active] ? `${listId}-${active}` : undefined}
            maxLength={200}
            value={text}
            onChange={(e) => {
              onText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={(e) => {
              e.target.select();
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
              onBlur?.();
            }}
            onKeyDown={onKey}
          />
          {onClear && text && (
            <button type="button" className="searchable-clear" aria-label={clearLabel} onClick={onClear}>
              ×
            </button>
          )}
        </span>
      </label>
      {shown && (
        <div className="searchable-menu">
          <ul id={listId} role="listbox">
            {options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus so the pick lands before blur
                  pick(o.id);
                }}
              >
                <strong>{o.primary}</strong>
                {o.secondary && <small>{o.secondary}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
