"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { RecordEditor, type Editor } from "./record-editor";

/** Page title (matches the nav label) plus the app-wide primary actions. */
export function PageHeader({ title }: { title: string }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <>
      <header className="page-title">
        <h1>{title}</h1>
        <div className="page-actions">
          <button
            className="secondary"
            onClick={() =>
              setEditor({
                kind: "project",
                item: { title: "新邀約", notes: "請將原始邀約貼入 Offer／邀約原文欄位，再確認商案類型與金額。" },
              })
            }
          >
            匯入邀約
          </button>
          <button className="primary" onClick={() => setEditor({ kind: "project" })}>
            <Plus size={16} />
            新增合作案
          </button>
        </div>
      </header>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
