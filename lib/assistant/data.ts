import "server-only";
import { and, between, eq, getTableColumns, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { plusDays, type PlanSource } from "@/lib/calendar/planner";
import { calendarItemsOf, externalEventsOf, paymentsOf } from "@/lib/data/rows";
import { db } from "@/lib/db";
import {
  calendarConnection,
  calendarEvent,
  calendarImportSource,
  calendarSeriesProject,
  externalEvent,
  payment,
  paymentReceipt,
  project,
  talent,
  todo,
} from "@/lib/db/schema";
import type { Payment, ProjectSummary } from "@/lib/types";

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
 * What planItems needs for one day. An item stored in another zone can fall on the talent's day
 * from the day before or after, so events, to-dos, and Google events are read a day either side
 * and planItems places them; a trip's arrival marks its end day.
 */
export async function scheduleSource(talentId: string, personId: string, day: string): Promise<PlanSource> {
  const from = plusDays(day, -1);
  const to = plusDays(day, 1);
  const [owner, eventRows, todoRows, paymentRows, [connection]] = await Promise.all([
    talentOf(talentId),
    db
      .select()
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.talentId, talentId),
          isNull(calendarEvent.deletedInGoogleAt),
          or(between(calendarEvent.startDate, from, to), eq(calendarEvent.endDate, day)),
        ),
      ),
    db.select().from(todo).where(and(eq(todo.talentId, talentId), between(todo.dueDate, from, to))),
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(and(eq(payment.talentId, talentId), eq(payment.status, "expected"), isNull(payment.voidedAt), eq(payment.dueOn, day))),
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
