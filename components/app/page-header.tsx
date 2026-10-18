"use client";

import {usePortfolio} from "./portfolio-provider";
import { Plus, ClipboardPaste, FileUp, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { NavKey } from "./nav";
import { MoreMenu } from "@/components/views/more-menu";
import { PasteDialog } from "./paste-dialog";
import { RecordEditor, type Editor } from "./record-editor";
import { Toast } from "./toast";

// As in the prototype, only the intake-oriented pages carry the new-offer actions.
const withActions: NavKey[] = ["today", "inbox"];

/** Page title (matches the nav label) and an optional line beside it, plus new-offer actions on Today and Intake, or a page's own controls. */
export function PageHeader({ titleKey, subtitle, children }: { titleKey: NavKey; subtitle?: ReactNode; children?: ReactNode }) {
  const t = useTranslations();
  const portfolio=usePortfolio();
  const artistView=titleKey==="today"&&portfolio?.ids!==null&&portfolio?.ready;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pasting, setPasting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <header className="page-title">
        {subtitle ? (
          // Beside the heading, not in it: the page's name stays just its name.
          <div className="page-heading">
            <h1>{t(`nav.${titleKey}`)}</h1>
            {subtitle}
          </div>
        ) : (
          <h1>{t(`nav.${titleKey}`)}</h1>
        )}
        {withActions.includes(titleKey) && !artistView && (
          <div className="page-actions">
            {/* On Intake its own dialog opens (and selects the new message); elsewhere it opens here, without leaving the page. */}
            {titleKey === "inbox" ? (
              <MoreMenu label={t("shell.importOffer")} className="secondary offer-import" button={<>{t("shell.importOffer")}<ChevronDown size={16} aria-hidden="true"/></>}>
                <Link role="menuitem" href="/inbox?paste=1"><ClipboardPaste size={17} aria-hidden="true"/>{t("inbox.paste")}</Link>
                <Link role="menuitem" href="/inbox?upload=1"><FileUp size={17} aria-hidden="true"/>{t("inbox.upload")}</Link>
              </MoreMenu>
            ) : (
              <button className="secondary" onClick={() => setPasting(true)}>
                {t("shell.importOffer")}
              </button>
            )}
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              <Plus size={16} />
              {t("shell.newProject")}
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
