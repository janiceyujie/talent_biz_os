// Which widgets show, in what order, per column: the role's defaults, changed
// by what the person saved (only an order and what's hidden). The order is one
// list across both columns (lib/overview/widgets, MAIN_SPOTS). Anything
// unknown in a save is ignored, and a widget added later still appears, so
// old saves never break the page.
import type { Role } from "@/lib/roles";
import { defaultWidgets, isWidgetId, MAIN_SPOTS, type Column, type WidgetId } from "./widgets";

/** As read back (lib/preferences, "overview.layout"): ids may be from an older or newer version. */
export type SavedLayout = { version: 1; order?: string[]; hidden?: string[] };

/** Every widget for this role, in order across both columns, with whether it's hidden. */
export type EditableLayout = { id: WidgetId; hidden: boolean }[];

export const columnOf = (index: number): Column => (index < MAIN_SPOTS ? "main" : "side");

export function editableLayout(role: Role, saved?: SavedLayout | null): EditableLayout {
  const defaults = defaultWidgets[role];
  const order = (saved?.order ?? []).filter(isWidgetId).filter((id) => defaults.includes(id));
  const hidden = new Set((saved?.hidden ?? []).filter(isWidgetId));
  return [...new Set([...order, ...defaults])].map((id) => ({ id, hidden: hidden.has(id) }));
}

/** What shows in each column: its spots, without the hidden widgets. */
export function overviewLayout(role: Role, saved?: SavedLayout | null): Record<Column, WidgetId[]> {
  const layout = editableLayout(role, saved);
  const shown = (column: Column) => layout.filter((w, i) => columnOf(i) === column && !w.hidden).map((w) => w.id);
  return { main: shown("main"), side: shown("side") };
}

/** The edited arrangement as it's saved: the full order and what's hidden. */
export function toSavedLayout(layout: EditableLayout) {
  return { version: 1 as const, order: layout.map((w) => w.id), hidden: layout.filter((w) => w.hidden).map((w) => w.id) };
}

/** Move a widget to another spot; the ones between shift by one, so each column keeps its number of spots. */
export function moveWidget(layout: EditableLayout, from: number, to: number): EditableLayout {
  if (to < 0 || to >= layout.length || from === to) return layout;
  const list = [...layout];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list;
}
