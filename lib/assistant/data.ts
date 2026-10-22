import "server-only";
import { and, between, desc, eq, getTableColumns, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { planItems, plusDays, type PlanSource } from "@/lib/calendar/planner";
import { getProject, listProjects } from "@/lib/data/projects";
import { calendarItemsOf, contractsOf, externalEventsOf, paymentsOf } from "@/lib/data/rows";
import { db } from "@/lib/db";
import {
  calendarConnection,
  calendarEvent,
  calendarImportSource,
  calendarSeriesProject,
  contact,
  contract,
  externalEvent,
  organization,
  payment,
  paymentReceipt,
  project,
  projectContact,
  projectOrganization,
  talent,
  todo,
} from "@/lib/db/schema";
import type { Payment, ProjectSummary } from "@/lib/types";
import { SCHEDULE_DAYS, SNAPSHOT_LINES, type OverviewSource, type ProjectSource } from "./snapshot";

// The rows the assistant's answers read (decision 0023), fetched for the one
// question rather than from the layout (decision 0011). Every query is scoped
// to the signed-in talent; Google events also to the person, who alone sees them.

type ProjectName = Pick<ProjectSummary, "id" | "title" | "counterparty" | "archived" | "stage">;

/** The talent's name and zone, for "today" and for planItems. */
export async function talentOf(talentId: string) {
  const [row] = await db.select({ id: talent.id, name: talent.name, timeZone: talent.timeZone }).from(talent).where(eq(talent.id, talentId));
  return row;
}

async function projectNames(talentId: string, ids: (string | null)[]): Promise<ProjectName[]> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return [];
  const rows = await db
    .select({ id: project.id, title: project.title, counterparty: project.counterparty, archivedAt: project.archivedAt, stage: project.stage })
    .from(project)
    .where(and(eq(project.talentId, talentId), inArray(project.id, wanted)));
  return rows.map(({ archivedAt, ...p }) => ({ ...p, archived: archivedAt !== null }));
}

/**
 * What planItems needs for the days `first` to `last`. An item stored in another zone can fall on
 * the talent's day from the day before or after, so events, to-dos, and Google events are read a
 * day either side and planItems places them; a trip's arrival marks its end day.
 */
export async function scheduleSource(talentId: string, personId: string, first: string, last: string): Promise<PlanSource> {
  const from = plusDays(first, -1);
  const to = plusDays(last, 1);
  const [owner, eventRows, todoRows, paymentRows, [connection]] = await Promise.all([
    talentOf(talentId),
    db
      .select()
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.talentId, talentId),
          isNull(calendarEvent.deletedInGoogleAt),
          or(between(calendarEvent.startDate, from, to), between(calendarEvent.endDate, first, last)),
        ),
      ),
    db.select().from(todo).where(and(eq(todo.talentId, talentId), between(todo.dueDate, from, to))),
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(and(eq(payment.talentId, talentId), eq(payment.status, "expected"), isNull(payment.voidedAt), between(payment.dueOn, first, last))),
    db
      .select({ id: calendarConnection.id })
      .from(calendarConnection)
      .where(and(eq(calendarConnection.personId, personId), eq(calendarConnection.talentId, talentId))),
  ]);
  const [importSources, seriesLinks] = connection
    ? await Promise.all([
        db.select().from(calendarImportSource).where(eq(calendarImportSource.connectionId, connection.id)),
        db.select().from(calendarSeriesProject).where(eq(calendarSeriesProject.connectionId, connection.id)),
      ])
    : [[], []];
  const importedRows = importSources.length
    ? await db
        .select()
        .from(externalEvent)
        .where(
          and(
            inArray(externalEvent.sourceId, importSources.map((s) => s.id)),
            lte(externalEvent.startDate, to),
            gte(sql`coalesce(${externalEvent.endDate}, ${externalEvent.startDate})`, from),
          ),
        )
    : [];
  const calendar = calendarItemsOf(eventRows, todoRows);
  const externalEvents = externalEventsOf(importedRows, importSources, seriesLinks);
  const payments = paymentsOf(paymentRows, []); // a due date's amount is the payment's total
  const projects = await projectNames(talentId, [
    ...calendar.map((c) => c.projectId),
    ...payments.map((p) => p.projectId),
    ...externalEvents.map((e) => e.series?.projectId ?? null),
  ]);
  return { talent: owner, calendar, externalEvents, payments, projects };
}

/** Every open payment, in and out, with its receipts, and its project's name and stage. */
export async function moneySource(talentId: string): Promise<{ payments: Payment[]; projects: ProjectName[] }> {
  const paymentRows = await db
    .select({ ...getTableColumns(payment), projectType: project.type })
    .from(payment)
    .leftJoin(project, eq(project.id, payment.projectId))
    .where(and(eq(payment.talentId, talentId), eq(payment.status, "expected"), isNull(payment.voidedAt)));
  const ids = paymentRows.map((p) => p.id);
  const [receiptRows, projects] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(paymentReceipt)
          .where(and(eq(paymentReceipt.talentId, talentId), inArray(paymentReceipt.paymentId, ids)))
          .orderBy(paymentReceipt.createdAt)
      : [],
    projectNames(talentId, paymentRows.map((p) => p.projectId)),
  ]);
  return { payments: paymentsOf(paymentRows, receiptRows), projects };
}

/** What the workspace overview snapshot reads (lib/assistant/snapshot.ts): open money, the next days, active projects. */
export async function overviewSource(talentId: string, personId: string, today: string): Promise<OverviewSource> {
  const last = plusDays(today, SCHEDULE_DAYS - 1);
  const owner = await talentOf(talentId);
  const [{ payments, projects: projectNames }, schedule, page] = await Promise.all([
    moneySource(talentId),
    scheduleSource(talentId, personId, today, last),
    listProjects(talentId, owner.name, { view: "all", type: "all", contact: "", q: "", sort: "updated", cursor: "", limit: SNAPSHOT_LINES.projects }),
  ]);
  return {
    today,
    timeZone: owner.timeZone,
    payments,
    projectNames,
    schedule: planItems(schedule).filter((i) => i.date >= today && i.date <= last),
    projects: page.items,
    projectsTotal: page.total,
  };
}

/** What one project's snapshot reads, or null when the project isn't this talent's. */
export async function projectSource(talentId: string, personId: string, projectId: string, today: string): Promise<ProjectSource | null> {
  const owner = await talentOf(talentId);
  const full = await getProject(talentId, projectId, owner.name);
  if (!full) return null;
  const [paymentRows, receiptRows, eventRows, todoRows, people, organizations, contractRows] = await Promise.all([
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(and(eq(payment.talentId, talentId), eq(payment.projectId, projectId))),
    db
      .select({ receipt: paymentReceipt })
      .from(paymentReceipt)
      .innerJoin(payment, eq(payment.id, paymentReceipt.paymentId))
      .where(and(eq(paymentReceipt.talentId, talentId), eq(payment.projectId, projectId)))
      .orderBy(paymentReceipt.createdAt)
      .then((rows) => rows.map((r) => r.receipt)),
    db
      .select()
      .from(calendarEvent)
      .where(and(eq(calendarEvent.talentId, talentId), eq(calendarEvent.projectId, projectId), isNull(calendarEvent.deletedInGoogleAt))),
    db.select().from(todo).where(and(eq(todo.talentId, talentId), eq(todo.projectId, projectId))),
    db
      .select({ name: contact.name, label: projectContact.label })
      .from(projectContact)
      .innerJoin(contact, eq(contact.id, projectContact.contactId))
      .where(and(eq(projectContact.talentId, talentId), eq(projectContact.projectId, projectId))),
    db
      .select({ name: organization.name, role: projectOrganization.role, primary: projectOrganization.isPrimary })
      .from(projectOrganization)
      .innerJoin(organization, eq(organization.id, projectOrganization.organizationId))
      .where(and(eq(projectOrganization.talentId, talentId), eq(projectOrganization.projectId, projectId)))
      .orderBy(desc(projectOrganization.isPrimary)),
    db
      .select()
      .from(contract)
      .where(and(eq(contract.talentId, talentId), eq(contract.projectId, projectId)))
      .orderBy(desc(contract.versionNumber)),
  ]);
  const payments = paymentsOf(paymentRows, receiptRows);
  // Its dates from a month back on, money due dates included (they're listed with the payments too).
  const schedule = planItems({ talent: owner, calendar: calendarItemsOf(eventRows, todoRows), payments: [], projects: [full] }).filter(
    (i) => i.date >= plusDays(today, -30),
  );
  return {
    today,
    timeZone: owner.timeZone,
    project: full,
    payments,
    schedule,
    people: people.map((p) => ({ name: p.name, label: p.label ?? "" })),
    organizations: organizations.map((o) => ({ name: o.name, role: o.role ?? "", primary: o.primary })),
    contracts: contractsOf(contractRows),
  };
}
