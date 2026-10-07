// The projects list's shape, shared by its endpoint (app/api/projects) and the page that scrolls it.
import type { Phase } from "./phases";
import type { ProjectSummary } from "@/lib/types";

export const listSorts = ["due", "updated", "amount", "title"] as const;
export type ListSort = (typeof listSorts)[number];
/** A phase, or the archived projects (their own view, whatever their stage). */
export type ListView = Phase | "archived";

export const PAGE_SIZE = 50;
export const PAGE_MAX = 200; // a reload after a save asks for as many rows as were showing

export type ProjectPage = {
  items: ProjectSummary[];
  nextCursor: string | null;
  /** Rows matching the view, type, and search. */
  total: number;
  /** Projects per view over the whole workspace, ignoring type and search (as the tabs show them). */
  counts: Record<ListView, number>;
};
