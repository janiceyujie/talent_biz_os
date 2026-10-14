"use client";
import { useAppData } from "./app-data";
import { useCursorPages } from "./cursor-pages";
import type { StoredFile } from "@/lib/types";
export function useFilePages(project = "", q = "", archived = false) {
  const data = useAppData();
  const page = useCursorPages<StoredFile>(`/api/files?${new URLSearchParams({ project, q, archived: String(archived) })}`,
    `${data.person.email}:${data.talent.id}`, data, !data.preview);
  if (!data.preview) return page;
  const items = data.files.filter(f => f.archived === archived && (!project || f.projectId === project) && f.filename.toLowerCase().includes(q.toLowerCase()));
  return { ...page, items, total: items.length, loading: false, failed: false, hasMore: false };
}
