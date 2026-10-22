// How the ⌘K search ranks what matches, and reads the picks the browser remembers. Pure: the server
// runs it on what the database matched (lib/data/search.ts).

export type SearchItem = {
  id: string; // "<kind>:<id>", unique across kinds; recent picks are remembered by it
  kind: "project" | "contact" | "organization" | "calendar" | "template";
  label: string;
  detail: string;
  keywords?: string; // matched, not shown: a contact's email
  href: string;
};

/** Suggestions shown before anything is typed: recent picks first. */
export const SUGGESTIONS = 5;
/** Recent picks remembered. */
export const RECENT_MAX = 20;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();

/**
 * Items matching every word typed, best first: the name exactly, then names starting with it,
 * names containing it, and last a match only in the details. Ties keep the workspace's order.
 * With nothing typed: recent picks still in the workspace, then the first others.
 */
export function searchWorkspace(items: SearchItem[], query: string, recent: string[] = []): SearchItem[] {
  const term = normalize(query);
  if (!term) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const remembered = [...new Set(recent)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const shown = new Set(remembered.map((item) => item.id));
    return [...remembered, ...items.filter((item) => !shown.has(item.id))].slice(0, SUGGESTIONS);
  }
  const words = term.split(/\s+/);
  return items
    .map((item) => {
      const name = normalize(item.label);
      const text = normalize(`${item.label} ${item.detail} ${item.keywords ?? ""}`);
      const score = !words.every((w) => text.includes(w)) ? 0 : name === term ? 4 : name.startsWith(term) ? 3 : name.includes(term) ? 2 : 1;
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

/** Recent picks as stored in the browser: ids only, deduplicated; anything unreadable is none. */
export function readSearchHistory(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length < 200))].slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
