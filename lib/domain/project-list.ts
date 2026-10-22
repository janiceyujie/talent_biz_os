// The projects list's shape, shared by its endpoint (app/api/projects) and the page that scrolls it.
import { phases, type Phase } from "./phases";
import type { ProjectSummary } from "@/lib/types";
import type { ListPage } from "./list-page";

export const listSorts = ["due", "updated", "amount", "title"] as const;
export type ListSort = (typeof listSorts)[number];
/** A phase, every active project (`all`, what a search covers), or the archived ones (their own view, whatever their stage). */
export type ListView = Phase | "all" | "archived";
export const listViews = ["all", ...phases, "archived"] as const satisfies readonly ListView[];

export { PAGE_MAX, PAGE_SIZE } from "./list-page";

/** `total`: rows matching the view, type, and search, the open view's count. */
export type ProjectPage = ListPage<ProjectSummary> & {
  /** Projects per view under the same type and search, so each tab's number matches the list it opens. */
  counts: Record<ListView, number>;
};
