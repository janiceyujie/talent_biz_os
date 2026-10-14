export type SearchItem = { id: string; label: string; detail: string; keywords?: string; href: string; kind: "project" | "contact" | "organization" | "calendar" | "template" };

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();

/** Match each token; names outrank descriptive metadata. Stable ties preserve workspace order. */
export function searchWorkspace(items: SearchItem[], query: string, recent: string[] = []) {
  const term = normalize(query);
  if (!term) {
    const byId = new Map(items.map(item => [item.id, item]));
    const remembered = [...new Set(recent)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
    const used = new Set(remembered.map(item => item.id));
    return [...remembered, ...items.filter(item => !used.has(item.id))].slice(0, 5);
  }
  const words = term.split(/\s+/);
  return items.map(item => {
    const name = normalize(item.label);
    const text = normalize(`${item.label} ${item.detail} ${item.keywords ?? ""}`);
    const score = !words.every(word => text.includes(word)) ? 0 : name === term ? 4 : name.startsWith(term) ? 3 : name.includes(term) ? 2 : 1;
    return { item, score };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.item);
}

export function readSearchHistory(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length < 200))].slice(0, 20) : [];
  } catch { return []; }
}
