"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { Modal } from "./modal";

/**
 * Asks before a change that's hard to take back (removing someone from a
 * project, an organisation, ...). Cancel is the default focus; the
 * confirming button names the action.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  // Cancel takes focus once the dialog is open (opening it moves focus to its first control, the close button).
  // The dialog is a child, so its effect has run by the time this one does.
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <Modal title={title} onClose={onClose}>
      {children && <div className="confirm-body">{children}</div>}
      <footer className="modal-actions">
        <button ref={cancel} type="button" className="secondary" onClick={onClose}>
          {t("cancel")}
        </button>
        <button type="button" className="secondary danger-outline" disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}
