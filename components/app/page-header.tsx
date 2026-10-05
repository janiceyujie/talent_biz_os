"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { NavKey } from "./nav";
import { RecordEditor, type Editor } from "./record-editor";

// As in the prototype, only the intake-oriented pages carry the new-offer actions.
const withActions: NavKey[] = ["today", "inbox"];

/** Page title (matches the nav label), plus new-offer actions on Today and Intake, or a page's own controls. */
export function PageHeader({ titleKey, children }: { titleKey: NavKey; children?: ReactNode }) {
  const t = useTranslations();
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <>
      <header className="page-title">
        <h1>{t(`nav.${titleKey}`)}</h1>
        {withActions.includes(titleKey) && (
          <div className="page-actions">
            <Link className="secondary" href="/inbox?paste=1">
              {t("shell.importOffer")}
            </Link>
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              <Plus size={16} />
              {t("shell.newProject")}
            </button>
          </div>
        )}
        {children && <div className="page-actions">{children}</div>}
      </header>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
