"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { ListMore } from "@/components/app/list-more";
import { useListPages } from "@/components/app/list-pages";
import type { ListPage } from "@/lib/domain/list-page";
import type { StoredFile } from "@/lib/types";
import { useLabels } from "@/lib/i18n/labels";
import { DocumentLibrary } from "./document-library";

export function FilesView() {
  const data = useAppData();
  const t = useTranslations("files");
  const tEyebrow = useTranslations("eyebrow");
  const labels = useLabels();
  const format = useFormatter();
  const [projectId, setProjectId] = useState(useSearchParams().get("project") ?? ""); // ?project= from a project's screen
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  // A page at a time (decision 0011); a search waits for typing to pause.
  const list = useListPages<ListPage<StoredFile>>("/api/files", { project: projectId, q, archived: String(archived) }, data);
  const files = list.items;

  return (
    <>
      <DocumentLibrary />
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("files")}</span>
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
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noopener">
                      <strong>{f.filename || t("untitled")}</strong>
                    </a>
                    <small>{format.dateTime(new Date(f.createdAt), { dateStyle: "medium" })}</small>
                  </td>
                  <td>{data.projects.find((p) => p.id === f.projectId)?.title || labels.unlinked()}</td>
                  <td>{format.number(f.sizeBytes / 1024, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ListMore list={list} failedText={t("listFailed")} />
        {!files.length && !list.loading && !list.failed && <p className="empty">{t("empty")}</p>}
      </section>
    </>
  );
}
