"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MoreMenu } from "@/components/views/more-menu";
import type { NavKey } from "./nav";
import { PasteDialog } from "./paste-dialog";
import { RecordEditor, type Editor } from "./record-editor";
import { Toast } from "./toast";

// As in the prototype, only the intake-oriented pages carry the new-offer actions.
const withActions: NavKey[] = ["today", "inbox"];

/** Page title (matches the nav label) and an optional line beside it, plus new-offer actions on Today and Intake, or a page's own controls. */
export function PageHeader({ titleKey, subtitle, children }: { titleKey: NavKey; subtitle?: ReactNode; children?: ReactNode }) {
  const t = useTranslations();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pasting, setPasting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <header className={withActions.includes(titleKey) ? "page-title with-offer-actions" : "page-title"}>
        {subtitle ? (
          // Beside the heading, not in it: the page's name stays just its name.
          <div className="page-heading">
            <h1>{t(`nav.${titleKey}`)}</h1>
            {subtitle}
          </div>
        ) : (
          <h1>{t(`nav.${titleKey}`)}</h1>
        )}
        {withActions.includes(titleKey) && (
          <div className="page-actions">
            {/* On Intake its own dialog opens (and selects the new message); elsewhere it opens here, without leaving the page. */}
            {/* Intake has no buttons of its own for these: both ways in are here. */}
            {titleKey === "inbox" ? (
              <MoreMenu
                label={t("shell.importOffer")}
                className="secondary"
                button={
                  <>
                    {t("shell.importOffer")}
                    <ChevronDown size={16} aria-hidden="true" />
                  </>
                }
              >
                <Link role="menuitem" href="/inbox?paste=1">
                  {t("inbox.paste")}
                </Link>
                <Link role="menuitem" href="/inbox?upload=1">
                  {t("inbox.upload")}
                </Link>
              </MoreMenu>
            ) : (
              <button className="secondary" onClick={() => setPasting(true)}>
                {t("shell.importOffer")}
              </button>
            )}
            {/* On a phone just +, so the title and both actions fit one row. */}
            <button className="primary" aria-label={t("shell.newProject")} onClick={() => setEditor({ kind: "project" })}>
              <Plus size={16} aria-hidden="true" />
              <span className="page-action-label">{t("shell.newProject")}</span>
            </button>
          </div>
        )}
        {children && <div className="page-actions">{children}</div>}
      </header>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
      {pasting && (
        <PasteDialog
          onClose={() => setPasting(false)}
          onSubmitted={(_id, duplicate) => {
            setPasting(false);
            setToast(t(duplicate ? "shell.importDuplicate" : "shell.importSent"));
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
