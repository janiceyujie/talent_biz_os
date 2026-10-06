// A person's settings per workspace (the `preference` table): every allowed
// key and the shape of its value. Reading is forgiving — an unknown key or a
// value that doesn't fit is treated as "not set", so the defaults apply and an
// old or broken save never breaks a page. Saving is strict (lib/actions/preferences).
import { z } from "zod";
import { widgetIds } from "@/lib/overview/widgets";

const MAX_IDS = 50;

export const preferences = {
  /** 今日總覽's arrangement: only what differs from the role's defaults (lib/overview/layout). */
  "overview.layout": {
    read: z.object({
      version: z.literal(1),
      order: z.array(z.string().max(40)).max(MAX_IDS).optional(),
      hidden: z.array(z.string().max(40)).max(MAX_IDS).optional(),
    }),
    save: z.object({
      version: z.literal(1),
      order: z.array(z.enum(widgetIds)).max(widgetIds.length),
      hidden: z.array(z.enum(widgetIds)).max(widgetIds.length),
    }),
  },
} as const;

export type PreferenceKey = keyof typeof preferences;
export const isPreferenceKey = (key: string): key is PreferenceKey => Object.hasOwn(preferences, key);

/** What the app works with: each key's value if it was saved and fits, otherwise null. */
export type Preferences = { [K in PreferenceKey]: z.infer<(typeof preferences)[K]["read"]> | null };

export function readPreferences(rows: { key: string; value: unknown }[]): Preferences {
  const found = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    (Object.keys(preferences) as PreferenceKey[]).map((key) => {
      const parsed = preferences[key].read.safeParse(found.get(key));
      return [key, parsed.success ? parsed.data : null];
    }),
  ) as Preferences;
}
