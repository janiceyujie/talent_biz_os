"use server";

import { and, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, calendarEvent, contact, organization, payment, paymentReceipt, invoice, project, talent as talentTable, todo } from "@/lib/db/schema";
import { requestCalendarSync } from "@/lib/calendar/google/sync";
import { dateInZone } from "@/lib/domain/dates";
import {withReceiptRows} from "@/lib/data/payment-receipts";
import {paymentBalance} from "@/lib/domain/payment-receipts";
import { supportedCurrencies, type Currency } from "@/lib/domain/money";
import { phaseOf } from "@/lib/domain/phases";
import { activeReceipts, paymentRemaining } from "@/lib/domain/workflow";
import { organizationNamed, setClient } from "@/lib/data/organizations";
import { projectTypeKeys } from "@/lib/project-types";
import { stages, type Stage } from "@/lib/types";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const projectInput = z
  .object({
    id: optionalId,
    title: z.string().trim().min(1, "projectTitleRequired").max(200),
    counterparty: z.string().trim().max(200).default(""),
    // The client (decision 0012): an organisation picked, or a name typed for a new one.
    organizationId: optionalId,
    organizationName: z.string().trim().max(200).default(""),
    counterpartyId: optionalId,
    // A partner not yet in contacts, added as one with the project (when nothing is linked).
    newContact: z
      .object({
        name: z.string().trim().min(1, "contactNameRequired").max(200),
        company: optionalText,
        email: z.union([z.literal(""), z.email("emailInvalid")]).transform((v) => v || null),
        phone: optionalText,
      })
      .nullable()
      .optional(),
    type: z.enum(projectTypeKeys, "typeRequired"),
    stage: z.enum(stages),
    // Blank is "quote not set" (not decided), stored as null; 0 is an explicit free project.
    // "" must be tried first: z.coerce.number() would turn "" into 0.
    quotedAmount: z
      .union([
        z.literal(""),
        z.null(),
        z.coerce.number().min(0, "amountNegative").max(9_999_999_999.99).multipleOf(0.01, "amountDecimals"),
      ])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    // The deal's own currency: what its quote is in. Its payments may be in any currency.
    currency: z.enum(supportedCurrencies),
    // Payments of this deal still in its old currency, put in the new one with it (amounts unchanged).
    paymentsToCurrency: z.array(z.uuid()).max(500).default([]),
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.0001),
    taxIncluded: z.boolean(),
    deliverables: optionalText,
    rights: optionalText,
    travel: optionalText,
    contractNotes: optionalText,
    notes: optionalText,
  })
  .refine((p) => p.organizationId || p.organizationName || p.counterparty, { message: "clientRequired" })
  .refine((p) => p.currency !== "JPY" || p.quotedAmount === null || Number.isInteger(p.quotedAmount), { message: "amountWholeYen" });

/** Create or update a project. Returns an error message, or null on success. */
export async function saveProject(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = projectInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;

  // The main contact, if one is picked, must be this talent's.
  if (input.counterpartyId) {
    const [linked] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.id, input.counterpartyId), eq(contact.talentId, talent.id)));
    if (!linked) return fail("counterpartyNotFound");
  }

  const values = {
    title: input.title,
    counterparty: input.organizationName || input.counterparty, // replaced by the client's own name below
    counterpartyId: input.counterpartyId,
    type: input.type,
    stage: input.stage,
    quotedAmount: input.quotedAmount,
    quoteCurrency: input.currency,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
    details: {
      deliverables: input.deliverables ?? undefined,
      rights: input.rights ?? undefined,
      travel: input.travel ?? undefined,
      contractNotes: input.contractNotes ?? undefined,
    },
    notes: input.notes,
  };

  const failure = await db.transaction(async (tx) => {
    // The client: the organisation picked, else the one with the typed name (made if there's none).
    let client: { id: string; name: string };
    if (input.organizationId) {
      const [org] = await tx
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(and(eq(organization.id, input.organizationId), eq(organization.talentId, talent.id)));
      if (!org) return fail("organizationNotFound");
      client = org;
    } else client = await organizationNamed(tx, talent.id, input.organizationName || input.counterparty);
    values.counterparty = client.name;

    // The main contact works at the client: a new one is made there, an existing one without an organisation moves there.
    if (!input.counterpartyId && input.newContact) {
      const [created] = await tx
        .insert(contact)
        .values({ ...input.newContact, talentId: talent.id, role: "counterparty", organizationId: client.id })
        .returning({ id: contact.id });
      values.counterpartyId = created.id;
    } else if (input.counterpartyId)
      await tx
        .update(contact)
        .set({ organizationId: client.id })
        .where(and(eq(contact.id, input.counterpartyId), eq(contact.talentId, talent.id), isNull(contact.organizationId)));

    if (!input.id) {
      const [created] = await tx
        .insert(project)
        .values({ ...values, talentId: talent.id })
        .returning({ id: project.id });
      await setClient(tx, talent.id, created.id, client.id);
      await tx.insert(auditLog).values({
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "project.created",
        targetType: "project",
        targetId: created.id,
      });
      return null;
    }
    const [existing] = await tx
      .select({ stage: project.stage, currency: project.quoteCurrency, details: project.details })
      .from(project)
      .where(and(eq(project.id, input.id), eq(project.talentId, talent.id)))
      .for("update");
    if (!existing) return fail("projectNotFound");
    if (existing.currency !== input.currency) {
      const linked=await tx.select({id:payment.id}).from(payment).where(and(eq(payment.projectId,input.id),eq(payment.talentId,talent.id))).for("update");
      if(linked.length && !input.paymentsToCurrency.length)return fail("projectCurrencyLocked");
      const docs=await tx.select({id:invoice.id}).from(invoice).where(and(eq(invoice.projectId,input.id),eq(invoice.talentId,talent.id),notInArray(invoice.status,["cancelled"])));
      if(docs.length)return fail("projectCurrencyLocked");
      const moved = await movePayments(tx, talent.id, input.id, input.paymentsToCurrency, existing.currency, input.currency);
      if (moved === null) return fail("paymentsChanged");
      if (moved === "wholeYen") return fail("amountWholeYen");
      await tx.insert(auditLog).values({
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "project.currency_changed",
        targetType: "project",
        targetId: input.id,
        details: { from: existing.currency, to: input.currency, payments: moved },
      });
    }
    if (input.stage === "closed") {
      const outstanding = await withReceiptRows(tx,await tx.select().from(payment).where(and(eq(payment.projectId, input.id), eq(payment.talentId, talent.id))).for("update"));
      if (outstanding.some(p => !p.voidedAt && paymentBalance(p).remaining > 0)) return fail("projectOutstanding");
    }
    // The form edits only some details; keep the rest (deal fields, dates, to-confirm list from messages).
    const details = { ...existing.details, ...values.details };
    await tx.update(project).set({ ...values, details }).where(and(eq(project.id, input.id), eq(project.talentId, talent.id)));
    await setClient(tx, talent.id, input.id, client.id);
    if (existing.stage !== input.stage)
      await logStageChange(tx, talent.id, person.personId, input.id, existing.stage, input.stage);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/**
 * A deal's currency was set wrong: put the picked payments in the new one too, amounts as they are
 * (a correction, not a conversion). Only this deal's live payments still in the old currency; null
 * when one of them isn't any more (edited meanwhile), "wholeYen" when an amount has cents.
 */
async function movePayments(tx: Tx, talentId: string, projectId: string, ids: string[], from: string, to: Currency) {
  if (!ids.length) return [];
  const rows = await tx
    .select({ id: payment.id, amount: payment.amount })
    .from(payment)
    .where(
      and(
        inArray(payment.id, ids),
        eq(payment.talentId, talentId),
        eq(payment.projectId, projectId),
        eq(payment.currency, from),
        isNull(payment.voidedAt),
      ),
    )
    .for("update");
  if (rows.length !== new Set(ids).size) return null;
  const receipts = await tx
    .select({ cash: paymentReceipt.cash, withheld: paymentReceipt.withheld })
    .from(paymentReceipt)
    .where(inArray(paymentReceipt.paymentId, ids));
  if (to === "JPY" && [...rows.map((r) => r.amount), ...receipts.flatMap((r) => [r.cash, r.withheld])].some((n) => !Number.isInteger(n)))
    return "wholeYen";
  await tx.update(payment).set({ currency: to }).where(and(inArray(payment.id, ids), eq(payment.talentId, talentId)));
  return rows.map((r) => r.id);
}

// Talking about the deal goes on after it ends (declining politely, say); the rest of its plan doesn't.
const COMMUNICATION_TODOS = ["reply", "follow_up"] as const;

/** What's still open on a deal, as the lost-deal question lists it (decision 0018). */
export type OpenDealItems = {
  payments: { label: string; amount: number; currency: string; dueDate: string | null }[];
  todos: { title: string; dueDate: string | null }[];
  events: { title: string; date: string; time: string | null }[];
};

/** Open items on a deal: money still expected, its plan's to-dos, and events still ahead. */
async function openItems(tx: Pick<typeof db, "select">, talentId: string, projectId: string, today: string) {
  const [payments, todos, events] = await Promise.all([
    tx
      .select()
      .from(payment)
      .where(and(eq(payment.talentId, talentId), eq(payment.projectId, projectId), eq(payment.status, "expected"), isNull(payment.voidedAt))),
    tx
      .select({ id: todo.id, title: todo.title, dueDate: todo.dueDate })
      .from(todo)
      .where(and(eq(todo.talentId, talentId), eq(todo.projectId, projectId), eq(todo.status, "open"), notInArray(todo.type, [...COMMUNICATION_TODOS]))),
    tx
      .select({ id: calendarEvent.id, title: calendarEvent.title, date: calendarEvent.startDate, time: calendarEvent.startTime })
      .from(calendarEvent)
      .where(
        and(
          eq(calendarEvent.talentId, talentId),
          eq(calendarEvent.projectId, projectId),
          eq(calendarEvent.status, "confirmed"),
          isNull(calendarEvent.archivedAt),
          isNull(calendarEvent.deletedInGoogleAt),
          gte(calendarEvent.startDate, today),
        ),
      ),
  ]);
  // Part may have arrived already: that stays (money that moved), and only what's left is listed.
  const receiptRows = payments.length
    ? await tx.select().from(paymentReceipt).where(inArray(paymentReceipt.paymentId, payments.map((p) => p.id))).orderBy(paymentReceipt.createdAt)
    : [];
  const withReceipts = payments.map((p) => {
    const receipts = receiptRows
      .filter((r) => r.paymentId === p.id)
      .map((r) => ({ id: r.id, date: r.receivedOn, cash: r.cash, withheld: r.withheld, note: "", replacesId: r.replacesId, withdrawn: r.withdrawn, recordedAt: "" }));
    const row = { ...p, currency: p.currency as Currency, receipts, status: "expected" as const };
    return { ...p, remaining: paymentRemaining(row), started: activeReceipts(row).length > 0 };
  });
  return { payments: withReceipts, todos, events };
}

const todayFor = async (talentId: string) => {
  const [row] = await db.select({ timeZone: talentTable.timeZone }).from(talentTable).where(eq(talentTable.id, talentId));
  return dateInZone(row?.timeZone ?? "Asia/Taipei");
};

/** Before marking a deal declined or cancelled: what's still open on it, to ask about (decision 0018). */
export async function openDealItems(id: string): Promise<OpenDealItems | null> {
  const { talent } = await requireTalent();
  if (!z.uuid().safeParse(id).success) return null;
  const [owned] = await db.select({ id: project.id }).from(project).where(and(eq(project.id, id), eq(project.talentId, talent.id)));
  if (!owned) return null;
  const { payments, todos, events } = await openItems(db, talent.id, id, await todayFor(talent.id));
  return {
    payments: payments.map((p) => ({ label: p.label, amount: p.remaining, currency: p.currency, dueDate: p.dueOn })),
    todos: todos.map(({ title, dueDate }) => ({ title, dueDate })),
    events: events.map(({ title, date, time }) => ({ title, date, time: time ? time.slice(0, 5) : null })),
  };
}

/**
 * Move a project to a stage. Marking it declined or cancelled with `cancelOpen` also cancels what
 * was still open on it (decision 0018): money still expected, its plan's to-dos, and events still
 * ahead, which then leave Google Calendar too. Money that moved and past events stay.
 */
export async function setProjectStage(id: string, stage: Stage, { cancelOpen = false } = {}): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success || !stages.includes(stage)) return fail("invalid");
  const today = await todayFor(talent.id);
  let eventsCancelled = false;
  const failure = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ stage: project.stage })
      .from(project)
      .where(and(eq(project.id, id), eq(project.talentId, talent.id))).for("update");
    if (!existing) return fail("projectNotFound");
    if (stage === "closed") {
      const outstanding = await withReceiptRows(tx,await tx.select().from(payment).where(and(eq(payment.projectId, id), eq(payment.talentId, talent.id))).for("update"));
      if (outstanding.some(p => !p.voidedAt && paymentBalance(p).remaining > 0)) return fail("projectOutstanding");
    }
    if (existing.stage === stage) return null;
    await tx.update(project).set({ stage }).where(and(eq(project.id, id), eq(project.talentId, talent.id)));
    await logStageChange(tx, talent.id, person.personId, id, existing.stage, stage);
    if (cancelOpen && phaseOf(stage) === "ended") {
      const open = await openItems(tx, talent.id, id, today);
      // Started ones close short, keeping what arrived; the rest are cancelled (decision 0021).
      for (const [status, rows] of [["settled", open.payments.filter((p) => p.started)], ["cancelled", open.payments.filter((p) => !p.started)]] as const)
        if (rows.length) await tx.update(payment).set({ status }).where(inArray(payment.id, rows.map((p) => p.id)));
      if (open.todos.length) await tx.update(todo).set({ status: "dismissed" }).where(inArray(todo.id, open.todos.map((t) => t.id)));
      if (open.events.length) await tx.update(calendarEvent).set({ status: "cancelled" }).where(inArray(calendarEvent.id, open.events.map((e) => e.id)));
      eventsCancelled = open.events.length > 0;
    }
    return null;
  });
  // Cancelled events aren't pushed any more, so the next sync removes them from Google Calendar.
  if (!failure && eventsCancelled) await requestCalendarSync(talent.id);
  if (!failure) refresh();
  return failure;
}

export async function archiveProject(id: string, archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(project)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(project.id, id), eq(project.talentId, talent.id)))
    .returning({ id: project.id });
  if (!rows.length) return fail("projectNotFound");
  refresh();
  return null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function logStageChange(tx: Tx, talentId: string, actor: string, projectId: string, from: string, to: string) {
  await tx.insert(auditLog).values({
    talentId,
    actorPersonId: actor,
    action: "project.stage_changed",
    targetType: "project",
    targetId: projectId,
    details: { from, to },
  });
}
