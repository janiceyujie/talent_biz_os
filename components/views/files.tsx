"use client";

import { useState } from "react";
import { useAppData } from "@/components/app/app-data";

export function FilesView() {
  const data = useAppData();
  const [projectId, setProjectId] = useState("");
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const files = data.files.filter(
    (f) =>
      f.archived === archived &&
      (!projectId || f.projectId === projectId) &&
      f.filename.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section className="surface padded">
      <div className="section-header">
        <div>
          <span>Files & assets</span>
          <h2>保存每個合作案的檔案</h2>
        </div>
      </div>
      <p className="muted">上傳 Offer、合約、素材或發票，與合作案一起保存。歸檔後仍可還原。檔案上傳功能開發中。</p>
      <div className="toolbar wrap">
        <input aria-label="搜尋素材" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋檔名" />
        <select aria-label="素材關聯合作案" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">全部／未關聯</option>
          {data.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
        <button className="primary" disabled>
          上傳檔案
        </button>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          已歸檔
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>檔案</th>
              <th>合作案</th>
              <th>大小</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.filename}</strong>
                  <small>{new Date(f.createdAt).toLocaleDateString("zh-TW")}</small>
                </td>
                <td>{data.projects.find((p) => p.id === f.projectId)?.title || "未關聯"}</td>
                <td>{(f.sizeBytes / 1024).toFixed(1)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!files.length && <p className="empty">還沒有檔案。可上傳 Offer、合約、素材或發票。</p>}
    </section>
  );
}
