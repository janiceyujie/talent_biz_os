import "server-only";
import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, project, talent } from "@/lib/db/schema";
import { isProjectType } from "@/lib/project-types";
import type { AppData } from "@/lib/types";

/**
 * Everything the signed-in talent's screens show. Each list fills in as its
 * table is built (docs/architecture.md, "Built in"); until then it's empty
 * and the screen shows its empty state.
 */
export const getAppData = cache(async (): Promise<AppData> => {
  const { person, talent: current } = await requireTalent();
  const [[talentRow], projectRows, contactRows] = await Promise.all([
    db
      .select({ id: talent.id, name: talent.name, timeZone: talent.timeZone })
      .from(talent)
      .where(eq(talent.id, current.id)),
    db.select().from(project).where(eq(project.talentId, current.id)).orderBy(desc(project.updatedAt)),
    db.select().from(contact).where(eq(contact.talentId, current.id)).orderBy(contact.name),
  ]);

  return {
    talent: talentRow,
    person: { displayName: person.displayName, email: person.email },
    projects: projectRows.map((p) => ({
      id: p.id,
      title: p.title,
      counterparty: p.counterparty,
      counterpartyId: p.counterpartyId,
      artist: talentRow.name,
      type: isProjectType(p.type) ? p.type : "other",
      stage: p.stage,
      quotedAmount: p.quotedAmount ?? 0,
      currency: "TWD",
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      details: p.details,
      offerText: "", // from the source message, once messages are built
      notes: p.notes ?? "",
      nextAction: null, // the next open to-do, once to-dos are built
      archived: p.archivedAt !== null,
    })),
    contacts: contactRows.map((c) => ({
      id: c.id,
      role: c.role,
      name: c.name,
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      archived: c.archivedAt !== null,
    })),
    calendar: [],
    payments: [],
    templates: [],
    drafts: [],
    files: [],
    inbox: [],
  };
});
