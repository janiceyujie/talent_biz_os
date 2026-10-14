import type { AppData } from "@/lib/types";
import { phaseOf } from "./phases";
import { listViews, type ListSort, type ListView, type ProjectPage } from "./project-list";

/** The small synthetic portfolio uses the same filters without calling a live API. */
export function previewProjectPage(data: AppData, params: { view: ListView; type: string; contact: string; q: string; sort: ListSort }): ProjectPage {
  const query = params.q.trim().toLowerCase();
  const filtered = data.projects.filter(p => (params.type === "all" || p.type === params.type)
    && (!params.contact || p.counterpartyId === params.contact || data.projectPeople.some(r => r.projectId === p.id && r.contactId === params.contact))
    && (!query || `${p.title} ${p.counterparty} ${p.artist}`.toLowerCase().includes(query)));
  const matches = (p: typeof filtered[number], view: ListView) => view === "archived" ? p.archived : !p.archived && (view === "all" || phaseOf(p.stage) === view);
  const counts = Object.fromEntries(listViews.map(view => [view, filtered.filter(p => matches(p, view)).length])) as ProjectPage["counts"];
  const amount = (p: typeof filtered[number]) => p.quotedAmount === null ? -1 : p.quotedAmount * (p.taxIncluded ? 1 : 1 + p.taxRate / 100);
  const items = filtered.filter(p => matches(p, params.view)).sort((a,b) => {
    const order = params.sort === "amount" ? amount(b) - amount(a)
      : params.sort === "title" ? a.title.localeCompare(b.title)
      : params.sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt)
      : (a.nextAction?.dueDate ?? "9999-12-31").localeCompare(b.nextAction?.dueDate ?? "9999-12-31");
    return order || a.id.localeCompare(b.id);
  });
  return { items, total: items.length, counts, nextCursor: null };
}
