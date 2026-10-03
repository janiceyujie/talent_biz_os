import "server-only";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { cache } from "react";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvent, contact, membership, payment, person as personTable, project, replyTemplate, talent, todo } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { isProjectType } from "@/lib/project-types";
import { roleOf } from "@/lib/roles";
import { calendarKinds, type AppData, type CalendarItem, type CalendarKind, type TravelDetails } from "@/lib/types";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const todoKind: Record<string, CalendarKind> = { deliverable: "deliverable", payment_due: "payment" };
const eventKind = (k: string): CalendarKind => (calendarKinds.includes(k as CalendarKind) ? (k as CalendarKind) : "meeting");

/**
 * Everything the signed-in talent's screens show. Each list fills in as its
 * table is built (docs/architecture.md, "Built in"); until then it's empty
 * and the screen shows its empty state.
 */
export const getAppData = cache(async (): Promise<AppData> => {
  const { person, talent: current } = await requireTalent();
  const [[talentRow], [memberRow], projectRows, contactRows, paymentRows, eventRows, todoRows, templateRows] = await Promise.all([
    db
      .select({ id: talent.id, name: talent.name, timeZone: talent.timeZone, vertical: talent.vertical })
      .from(talent)
      .where(eq(talent.id, current.id)),
    db
      .select({
        feedHash: membership.calendarFeedTokenHash,
        accountType: personTable.accountType,
        appearance: personTable.avatarAppearance,
      })
      .from(membership)
      .innerJoin(personTable, eq(personTable.id, membership.personId))
      .where(and(eq(membership.personId, person.personId), eq(membership.talentId, current.id))),
    db.select().from(project).where(eq(project.talentId, current.id)).orderBy(desc(project.updatedAt)),
    db.select().from(contact).where(eq(contact.talentId, current.id)).orderBy(contact.name),
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(eq(payment.talentId, current.id))
      .orderBy(desc(payment.recordedOn), desc(payment.createdAt)),
    db.select().from(calendarEvent).where(eq(calendarEvent.talentId, current.id)),
    db.select().from(todo).where(eq(todo.talentId, current.id)).orderBy(todo.createdAt),
    db.select().from(replyTemplate).where(eq(replyTemplate.talentId, current.id)).orderBy(desc(replyTemplate.updatedAt)),
  ]);

  const calendar: CalendarItem[] = [
    ...eventRows.map((e) => ({
      id: e.id,
      source: "event" as const,
      kind: eventKind(e.kind),
      title: e.title,
      date: e.startDate,
      time: hhmm(e.startTime),
      timeZone: e.timeZone,
      location: e.location ?? "",
      projectId: e.projectId,
      notes: e.notes ?? "",
      done: false,
      archived: e.archivedAt !== null,
      travel:
        e.kind === "travel" || e.kind === "accommodation"
          ? ({
              endDate: e.endDate ?? "",
              endTime: hhmm(e.endTime),
              endTimeZone: e.endTimeZone ?? "",
              transportMode: e.transportMode ?? "",
              operator: e.operator ?? "",
              serviceNumber: e.serviceNumber ?? "",
              destination: e.destination ?? "",
              seat: e.seat ?? "",
              hotelName: e.hotelName ?? "",
            } satisfies TravelDetails)
          : null,
    })),
    ...todoRows
      .filter((t) => t.dueDate) // undated to-dos have no place on a calendar
      .map((t) => ({
        id: t.id,
        source: "todo" as const,
        kind: todoKind[t.type] ?? ("todo" as const),
        title: t.title,
        date: t.dueDate!,
        time: hhmm(t.dueTime),
        timeZone: t.timeZone,
        location: "",
        projectId: t.projectId,
        notes: t.notes ?? "",
        done: t.status === "done",
        archived: t.status === "dismissed",
        travel: null,
      })),
  ];

  // A project's next step: its earliest open to-do, undated ones last.
  const nextAction = new Map<string, { title: string; dueDate: string | null }>();
  for (const t of [...todoRows]
    .filter((t) => t.status === "open" && t.projectId)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))) {
    if (!nextAction.has(t.projectId!)) nextAction.set(t.projectId!, { title: t.title, dueDate: t.dueDate });
  }

  return {
    talent: { id: talentRow.id, name: talentRow.name, timeZone: talentRow.timeZone },
    person: {
      displayName: person.displayName,
      email: person.email,
      role: roleOf(memberRow.accountType, talentRow.vertical),
      appearance: memberRow.appearance,
    },
    calendarFeed: Boolean(memberRow?.feedHash),
    projects: projectRows.map((p) => ({
      id: p.id,
      title: p.title,
      counterparty: p.counterparty,
      counterpartyId: p.counterpartyId,
      artist: talentRow.name,
      type: isProjectType(p.type) ? p.type : "other",
      stage: p.stage,
      quotedAmount: p.quotedAmount,
      currency: "TWD",
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      details: p.details,
      offerText: "", // from the source message, once messages are built
      notes: p.notes ?? "",
      nextAction: nextAction.get(p.id) ?? null,
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
    calendar,
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
      voided: p.voidedAt !== null,
    })),
    templates: templateRows.map((t) => ({
      id: t.id,
      projectType: isProjectType(t.projectType) ? t.projectType : "other",
      kind: t.kind,
      language: toLocale(t.language),
      title: t.title,
      body: t.body,
      tone: t.tone ?? "",
      archived: t.archivedAt !== null,
    })),
    drafts: [],
    files: [],
    inbox: [],
  };
});
