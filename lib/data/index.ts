import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";
import type { AppData } from "@/lib/types";

/**
 * Everything the signed-in talent's screens show. Each list fills in as its
 * table is built (docs/architecture.md, "Built in"); until then it's empty
 * and the screen shows its empty state.
 */
export const getAppData = cache(async (): Promise<AppData> => {
  const { person, talent: current } = await requireTalent();
  const [row] = await db
    .select({ id: talent.id, name: talent.name, timeZone: talent.timeZone })
    .from(talent)
    .where(eq(talent.id, current.id));

  return {
    talent: row,
    person: { displayName: person.displayName, email: person.email },
    projects: [],
    contacts: [],
    calendar: [],
    payments: [],
    templates: [],
    drafts: [],
    files: [],
    inbox: [],
  };
});
