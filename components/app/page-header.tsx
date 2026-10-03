"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import type { NavKey } from "./nav";
import { RecordEditor, type Editor } from "./record-editor";

/** Page title (matches the nav label) plus the app-wide primary actions. */
export function PageHeader({ title }: { title: NavKey }) {
  const t = useTranslations();
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <>
      <header className="page-title">
        <h1>{t(`nav.${title}`)}</h1>
        <div className="page-actions">
          <Link className="secondary" href="/inbox">
            {t("shell.importOffer")}
          </Link>
          <button className="primary" onClick={() => setEditor({ kind: "project" })}>
            <Plus size={16} />
            {t("shell.newProject")}
          </button>
        </div>
      </header>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
