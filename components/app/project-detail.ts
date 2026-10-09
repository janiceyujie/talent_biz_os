"use client";

import { useAppData } from "./app-data";
import { useEffect, useState } from "react";
import type { Project, ProjectDetail, ProjectSummary } from "@/lib/types";

// Recently opened projects, so going back to one shows it at once. Keyed by
// the project's last change, so an edited project is fetched again.
const recent = new Map<string, ProjectDetail>();
// The last detail seen for each project, whatever its version: shown while a newer one loads,
// so saving a change doesn't blank the screen for a moment.
const latest = new Map<string, ProjectDetail>();
const RECENT_MAX = 30;
const keyOf = (p: Pick<Project, "id" | "updatedAt">) => `${p.id}@${p.updatedAt}`;

/** The full project: the summary every page has, with what its detail adds. */
export const withDetail = (project: ProjectSummary, detail: ProjectDetail): Project => ({ ...project, details: detail.details, notes: detail.notes });

async function fetchDetail(project: Pick<Project, "id" | "updatedAt">, signal?: AbortSignal) {
  const key = keyOf(project);
  const cached = recent.get(key);
  if (cached) return cached;
  const r = await fetch(`/api/projects/${project.id}`, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const detail = (await r.json()) as ProjectDetail;
  recent.set(key, detail);
  latest.set(project.id, detail);
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value!);
  return detail;
}

/** The full project, for an action outside a project's screen (e.g. editing it from Contacts). */
export const loadProject = async (project: ProjectSummary) => withDetail(project, await fetchDetail(project));

/** A project's details, notes, offer text, and timeline (app/api/projects/[id]), fetched when it's opened. */
export function useProjectDetail(project: Pick<Project, "id" | "updatedAt"> | undefined) {
  const data = useAppData();
  const preview = !!data.preview;
  const key = project ? keyOf(project) : "";
  const [state, setState] = useState<{ key: string; detail: ProjectDetail | null; failed: boolean }>({ key: "", detail: null, failed: false });

  useEffect(() => {
    if (preview || !project || recent.has(key)) return;
    const abort = new AbortController();
    fetchDetail(project, abort.signal)
      .then((detail) => setState({ key, detail, failed: false }))
      .catch(() => !abort.signal.aborted && setState({ key, detail: null, failed: true }));
    return () => abort.abort();
  }, [key, preview]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` covers the project

  if (preview) {
    const detail = project ? data.previewProjectDetails?.[project.id] ?? null : null;
    return { detail, loading: false, failed: !!project && !detail };
  }
  const cached = recent.get(key);
  if (cached) return { detail: cached, loading: false, failed: false };
  const current = state.key === key;
  // Refreshing after a change: keep showing what was there (stale) rather than nothing.
  const stale = project ? latest.get(project.id) : undefined;
  if (stale && !(current && state.failed)) return { detail: stale, loading: false, failed: false };
  return { detail: null, loading: !!project && !(current && state.failed), failed: current && state.failed };
}
