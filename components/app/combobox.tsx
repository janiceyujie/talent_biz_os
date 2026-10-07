"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type ComboOption = { id: string; primary: string; secondary?: string };

/**
 * A text input with a filtered list under it (ARIA combobox). The caller owns
 * the text and the matching; this handles the list, keyboard, and focus.
 * Arrow keys move, Enter picks, the first Escape closes the list (not the
 * dialog around it), and a click picks before the input loses focus.
 * `explicitPick`: nothing is highlighted until an arrow key moves there, so
 * Enter on typed text keeps the text instead of taking the first match.
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
  explicitPick = false,
  hideLabel = false,
  placeholder,
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
  explicitPick?: boolean;
  hideLabel?: boolean; // the label is beside it (a settings row): kept for screen readers only
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const none = explicitPick ? -1 : 0;
  const [active, setActive] = useState(none);
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
      setActive((i) => (n ? (Math.max(i, e.key === "ArrowDown" ? -1 : 0) + (e.key === "ArrowDown" ? 1 : -1) + n) % n : none));
    } else if (e.key === "Enter" && shown) {
      e.preventDefault(); // never submit the form from the list
      if (options[active]) pick(options[active].id);
      else setOpen(false);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <div className="searchable-field">
      <label>
        {hideLabel ? <span className="sr-only">{label}</span> : `${label}${required ? " *" : ""}`}
        <span className="searchable-input">
          <input
            role="combobox"
            aria-label={label}
            required={required}
            placeholder={placeholder}
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown && options[active] ? `${listId}-${active}` : undefined}
            maxLength={200}
            value={text}
            onChange={(e) => {
              onText(e.target.value);
              setOpen(true);
              setActive(none);
            }}
            onFocus={(e) => {
              e.target.select();
              setOpen(true);
              setActive(none);
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
      {/* The open list covers the same choices: show the hint only when it is closed. */}
      {hint && !shown && <small className="muted">{hint}</small>}
    </div>
  );
}
