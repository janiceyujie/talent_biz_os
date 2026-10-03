"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { useLabels } from "@/lib/i18n/labels";

export function FilesView() {
  const data = useAppData();
  const t = useTranslations("files");
  const labels = useLabels();
  const format = useFormatter();
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
          <h2>{t("title")}</h2>
        </div>
      </div>
      <p className="muted">{t("intro")}</p>
      <div className="toolbar wrap">
        <input aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} />
        <select aria-label={t("projectFilter")} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">{t("allOrUnlinked")}</option>
          {data.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
        <button className="primary" disabled>
          {t("upload")}
        </button>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("archivedOnly")}
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("colFile")}</th>
              <th>{t("colProject")}</th>
              <th>{t("colSize")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.filename}</strong>
                  <small>{format.dateTime(new Date(f.createdAt), { dateStyle: "medium" })}</small>
                </td>
                <td>{data.projects.find((p) => p.id === f.projectId)?.title || labels.unlinked()}</td>
                <td>{(f.sizeBytes / 1024).toFixed(1)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!files.length && <p className="empty">{t("empty")}</p>}
    </section>
  );
}
