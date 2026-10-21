"use client";

import { type ListSort, type ListView, type ProjectPage } from "@/lib/domain/project-list";
import { useListPages } from "./list-pages";

type ListParams = { view: ListView; type: string; contact: string; q: string; sort: ListSort };

/** The projects list from app/api/projects (decision 0011), with each view's count for the tabs. See useListPages. */
export function useProjectPages(params: ListParams, revision: unknown, restore = 0) {
  const { page, ...list } = useListPages<ProjectPage>("/api/projects", params, revision, { restore });
  return { ...list, counts: page?.counts ?? null };
}
