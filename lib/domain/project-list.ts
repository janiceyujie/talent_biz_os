// The projects list's shape, shared by its endpoint (app/api/projects) and the page that scrolls it.
import { phases, type Phase } from "./phases";
import type { ProjectSummary } from "@/lib/types";

export const listSorts = ["due", "updated", "amount", "title"] as const;
export type ListSort = (typeof listSorts)[number];
/** A phase, every active project (`all`, what a search covers), or the archived ones (their own view, whatever their stage). */
export type ListView = Phase | "all" | "archived";
export const listViews = ["all", ...phases, "archived"] as const satisfies readonly ListView[];

export const PAGE_SIZE = 50;
export const PAGE_MAX = 200; // a reload after a save asks for as many rows as were showing

export type ProjectPage = {
  items: ProjectSummary[];
  nextCursor: string | null;
  /** Rows matching the view, type, and search: the open view's count. */
  total: number;
  /** Projects per view under the same type and search, so each tab's number matches the list it opens. */
  counts: Record<ListView, number>;
};
