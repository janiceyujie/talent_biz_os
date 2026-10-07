"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Modal } from "@/components/app/modal";
import { resetPreference, savePreference } from "@/lib/actions/preferences";
import { columnOf, editableLayout, moveWidget, toSavedLayout, type EditableLayout, type SavedLayout } from "@/lib/overview/layout";
import type { Role } from "@/lib/roles";
import { widgetTitleKey } from "./registry";

const LAYOUT_KEY = "overview.layout";

/**
 * Customize Today: show or hide each widget and reorder them — with ↑/↓ (keyboard,
 * touch) or by dragging, across both columns; each column keeps its number of
 * spots. Saved per person and workspace; Restore defaults forgets the save.
 */
export function CustomizeOverview({
  role,
  saved,
  onClose,
  onDone,
}: {
  role: Role;
  saved: SavedLayout | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const [layout, setLayout] = useState<EditableLayout>(() => editableLayout(role, saved));
  const [dragging, setDragging] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<string | null>, done: string) =>
    startTransition(async () => {
      const failure = await action();
      if (failure) return setError(failure);
      onDone(done);
    });
  const toggle = (index: number) => setLayout((l) => l.map((w, i) => (i === index ? { ...w, hidden: !w.hidden } : w)));
  // One list shown as two groups; positions are across both, so ↑ on the side's first widget swaps it with the main's last.
  const rows = layout.map((w, index) => ({ ...w, index, column: columnOf(index) }));

  return (
    <Modal title={t("customizeTitle")} onClose={() => !pending && onClose()}>
      <p className="muted">{t("customizeBody")}</p>
      {(["main", "side"] as const).map((column) => (
        <fieldset key={column} className="customize-column" disabled={pending}>
          <legend>{t(column === "main" ? "columnMain" : "columnSide")}</legend>
          <ol>
            {rows
              .filter((w) => w.column === column)
              .map((w) => {
                const name = t(widgetTitleKey[w.id]);
                return (
                  <li
                    key={w.id}
                    draggable
                    className={dragging === w.index ? "is-dragging" : undefined}
                    onDragStart={() => setDragging(w.index)}
                    onDragOver={(e) => dragging !== null && e.preventDefault()}
                    onDrop={() => {
                      if (dragging !== null) setLayout((l) => moveWidget(l, dragging, w.index));
                      setDragging(null);
                    }}
                    onDragEnd={() => setDragging(null)}
                  >
                    <GripVertical size={16} aria-hidden="true" className="customize-grip" />
                    <label className="customize-name">
                      <input type="checkbox" checked={!w.hidden} onChange={() => toggle(w.index)} />
                      <span>
                        <strong>{name}</strong>
                        <small>{t(`widgetAbout.${w.id}`)}</small>
                      </span>
                    </label>
                    <span className="customize-move">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("moveUp", { name })}
                        disabled={w.index === 0}
                        onClick={() => setLayout((l) => moveWidget(l, w.index, w.index - 1))}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("moveDown", { name })}
                        disabled={w.index === layout.length - 1}
                        onClick={() => setLayout((l) => moveWidget(l, w.index, w.index + 1))}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                );
              })}
          </ol>
        </fieldset>
      ))}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button className="text-button" disabled={pending || !saved} onClick={() => run(() => resetPreference(LAYOUT_KEY), t("customizeReset"))}>
          {t("restoreDefaults")}
        </button>
        <span className="modal-actions-spacer" />
        <button className="secondary" disabled={pending} onClick={onClose}>
          {tCommon("cancel")}
        </button>
        <button className="primary" disabled={pending} onClick={() => run(() => savePreference(LAYOUT_KEY, toSavedLayout(layout)), t("customizeSaved"))}>
          {pending ? tCommon("saving") : tCommon("save")}
        </button>
      </footer>
    </Modal>
  );
}
