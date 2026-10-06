// 今日總覽's widgets: what exists, how many spots each column has, and the
// default arrangement per role. Adding a widget: an id and an entry here, its data as
// a pure function beside this file, and its view in components/overview/widgets
// (the view registry there must cover every id, so the compiler catches a gap).
import type { Role } from "@/lib/roles";

export const widgetIds = ["actions", "stalled", "pipeline", "schedule", "money", "income"] as const;
export type WidgetId = (typeof widgetIds)[number];

export type Column = "main" | "side";

/**
 * The widgets are one ordered list: the first MAIN_SPOTS fill the main
 * (wider) column, the rest the side column. Each column keeps its number of
 * spots, so moving a widget across swaps it with the neighbour on the other side.
 */
export const MAIN_SPOTS = 3;

const standard: WidgetId[] = ["actions", "stalled", "pipeline", "schedule", "money", "income"];

/** The arrangement before anyone changes it: act-on widgets in the main spots, time and money in the side. A manager watches deals across work, so the pipeline comes before quiet deals. */
export const defaultWidgets: Record<Role, WidgetId[]> = {
  musician: standard,
  video: standard,
  influencer: standard,
  model: standard,
  other: standard,
  manager: ["actions", "pipeline", "stalled", "schedule", "money", "income"],
};

export const isWidgetId = (id: unknown): id is WidgetId => typeof id === "string" && (widgetIds as readonly string[]).includes(id);
