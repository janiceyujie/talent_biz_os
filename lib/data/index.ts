import "server-only";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { cache } from "react";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, payment, project, talent } from "@/lib/db/schema";
import { isProjectType } from "@/lib/project-types";
import type { AppData } from "@/lib/types";

/**
 * Everything the signed-in talent's screens show. Each list fills in as its
 * table is built (docs/architecture.md, "Built in"); until then it's empty
 * and the screen shows its empty state.
 */
export const getAppData = cache(async (): Promise<AppData> => {
  const { person, talent: current } = await requireTalent();
  const [[talentRow], projectRows, contactRows, paymentRows] = await Promise.all([
    db
      .select({ id: talent.id, name: talent.name, timeZone: talent.timeZone })
      .from(talent)
      .where(eq(talent.id, current.id)),
    db.select().from(project).where(eq(project.talentId, current.id)).orderBy(desc(project.updatedAt)),
    db.select().from(contact).where(eq(contact.talentId, current.id)).orderBy(contact.name),
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(eq(payment.talentId, current.id))
      .orderBy(desc(payment.recordedOn), desc(payment.createdAt)),
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
    payments: paymentRows.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      projectType: p.projectType && isProjectType(p.projectType) ? p.projectType : "other",
      direction: p.direction,
      installment: p.installment,
      label: p.label,
      amount: p.amount,
      currency: "TWD",
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      recordedDate: p.recordedOn,
      dueDate: p.dueOn,
      status: p.status,
      settledAmount: p.settledAmount,
      settledDate: p.settledOn,
      invoiceRef: p.invoiceRef ?? "",
      notes: p.notes ?? "",
      archived: p.archivedAt !== null,
    })),
    templates: [],
    drafts: [],
    files: [],
    inbox: [],
  };
});
