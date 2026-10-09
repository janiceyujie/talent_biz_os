"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitPastedMessage } from "@/lib/actions/messages";
import { useAppData } from "./app-data";
import { DataNotice } from "./data-notice";
import { Modal } from "./modal";

/** How often a page looks again while a message is being analyzed (it runs in the background). */
export const ANALYSIS_POLL_MS = 2500;

/** Paste an offer's text to have it analyzed: from Intake, and from the page header's Import offer wherever it is. */
export function PasteDialog({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (id: string, duplicate: boolean) => void }) {
  const t = useTranslations("inbox");
  const {preview} = useAppData();
  const tPreview = useTranslations("preview");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t("pasteTitle")} onClose={() => !pending && onClose()}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (preview) { setError(tPreview("readOnly")); return; }
          startTransition(async () => {
            const result = await submitPastedMessage(text);
            if ("error" in result) setError(result.error);
            else onSubmitted(result.id, result.duplicate);
          });
        }}
      >
        <label>
          {t("pasteLabel")}
          <textarea
            aria-label={t("pasteLabel")}
            rows={12}
            required
            autoFocus
            maxLength={50_000}
            placeholder={t("pastePlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="muted">{t("pasteHint")}</p>
        <DataNotice />
        {preview && <p className="muted">{tPreview("readOnly")}</p>}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" disabled={pending} onClick={onClose}>
            {t("dismiss")}
          </button>
          <button type="submit" className="primary" disabled={preview || pending || !text.trim()}>
            {pending ? t("submitting") : t("analyze")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
