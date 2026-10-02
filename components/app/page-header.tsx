"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
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
          <Link className="secondary" href="/inbox">
            匯入邀約
          </Link>
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
