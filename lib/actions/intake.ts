"use server";

// Applying what a message says to a project (docs/design/intake-to-project.md).
// The server recomputes the proposal from the stored analysis and the project
// as it is now; the browser only says which items are ticked and how their
// values were edited. Nothing the message proposes is applied unticked.

import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { upgradeAnalysis } from "@/lib/ai/analysis";
import { requireTalent } from "@/lib/auth";
import { getAppData } from "@/lib/data";
import { db } from "@/lib/db";
import { auditLog, calendarEvent, contact, contract, message, messageAnalysis, payment, person as personTable, project, todo } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { filedMessages, keptFields, proposeChanges, withField, type Change, type ChangeRecord, type IntakeContext } from "@/lib/domain/intake";
import { isSigned } from "@/lib/domain/phases";
import { paymentTotal } from "@/lib/domain/workflow";
import { projectTypeKeys } from "@/lib/project-types";
import { stages, type ProjectDate, type ProjectDetails, type Stage } from "@/lib/types";
import { errorText } from "./validation";

const day = z.iso.date();
const amount = z.number().positive().max(1e10);
const text = (max: number) => z.string().trim().min(1).max(max);

/** What the person may edit on each kind of item; other values come from the proposal. */
const edits = {
  fee: z.object({ to: z.number().min(0).max(1e10) }),
  field: z.object({ to: text(1000) }),
  contractNotes: z.object({ to: text(10000) }),
  date: z.object({ date: day, time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]) }),
  stage: z.object({}),
  settlePayment: z.object({ amount, settledOn: day }),
  newPayment: z.object({ amount, date: day }),
  paymentNote: z.object({}),
  todo: z.object({ dueDate: day }),
  toConfirm: z.object({ items: z.array(text(300)).max(10) }),
  contractVersion: z.object({}),
} satisfies Record<Change["kind"], z.ZodType>;

const applyInput = z.object({
  messageId: z.uuid(),
  projectId: z.uuid(),
  /** Ticked items by proposal id, with their edited values. */
  items: z.record(z.string().max(60), z.record(z.string(), z.unknown())),
  /** The answer to the stage question, when there is one. */
  stage: z.enum(stages).nullable(),
});
export type ApplyInput = z.input<typeof applyInput>;

/** The day a message arrived, in the talent's zone; proposals date reply to-dos from it. */
const receivedOn = (receivedAt: Date, timeZone: string) => dateInZone(timeZone, 0, receivedAt);

/** Apply the ticked items of a message's proposal to a project, and file the message there. */
export async function applyMessage(raw: ApplyInput): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = applyInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;

  const data = await getAppData();
  const target = data.projects.find((p) => p.id === input.projectId);
  if (!target) return fail("projectNotFound");
  if (target.archived) return fail("projectArchived");
  const [row] = await db
    .select({ receivedAt: message.receivedAt, status: message.status, analysis: messageAnalysis.analysis })
    .from(message)
    .innerJoin(messageAnalysis, eq(messageAnalysis.messageId, message.id))
    .where(and(eq(message.id, input.messageId), eq(message.talentId, talent.id)))
    .orderBy(desc(messageAnalysis.createdAt))
    .limit(1);
  if (!row || row.status !== "analyzed") return fail("messageNotFound");

  const timeZone = data.talent.timeZone;
  const ctx: IntakeContext = {
    projects: data.projects,
    contacts: data.contacts,
    payments: data.payments,
    calendar: data.calendar,
    receivedOn: receivedOn(row.receivedAt, timeZone),
    replyWithinDays: data.person.replyWithinDays,
    filed: filedMessages(data.inbox, input.messageId),
    contracts: data.contracts,
  };
  const { changes, question } = proposeChanges(upgradeAnalysis(row.analysis), target, ctx);

  // The stage: a ticked stage item, or the answer to the question (one of its two choices).
  let finalStage: Stage = target.stage;
  const offered = [...changes];
  if (question && input.stage) {
    if (!question.choices.includes(input.stage)) return fail("invalid");
    finalStage = input.stage;
    if (input.stage === "signed") offered.push(...question.ifSigned);
  }

  // Every ticked item must be in the proposal as it is now, with a valid edit.
  const ticked: Change[] = [];
  for (const [id, edit] of Object.entries(input.items)) {
    const change = offered.find((c) => c.id === id);
    if (!change) return fail("proposalChanged"); // the project changed since the screen opened
    const value = edits[change.kind].safeParse(edit);
    if (!value.success) return fail("invalid");
    // A date's edit is its day and time; every other edit names the item's own fields.
    ticked.push(change.kind === "date" ? { ...change, to: { ...change.to, ...value.data } } : ({ ...change, ...value.data } as Change));
  }
  for (const c of ticked) if (c.kind === "stage") finalStage = c.to;

  const today = dateInZone(timeZone);
  if (ticked.some((c) => (c.kind === "settlePayment" && c.settledOn > today) || (c.kind === "newPayment" && c.date > today)))
    return fail("settledDateFuture");

  const t = await getTranslations("intake");
  const signedAfter = isSigned(finalStage);
  // Payments and their to-dos were proposed only for signed work (decision 0004); a cancellation fee keeps that link.
  const failure = await db.transaction(async (tx) => {
    const filed = await tx
      .update(message)
      .set({ projectId: target.id, status: "confirmed" })
      .where(and(eq(message.id, input.messageId), eq(message.talentId, talent.id), eq(message.status, "analyzed")))
      .returning({ id: message.id });
    if (!filed.length) return fail("messageNotFound");
    const [current] = await tx
      .select({ details: project.details, stage: project.stage })
      .from(project)
      .where(and(eq(project.id, target.id), eq(project.talentId, talent.id)))
      .for("update");
    if (!current || current.stage !== target.stage) return fail("proposalChanged");

    let details = current.details;
    const kept: (ProjectDate | null)[] = [...(details.dates ?? [])];
    const projectSet: Partial<typeof project.$inferInsert> = {};
    const applied: ChangeRecord[] = [];

    for (const c of ticked) {
      applied.push({ ...c, ticked: true });
      switch (c.kind) {
        case "fee":
          projectSet.quotedAmount = c.to;
          if (c.taxIncluded !== null) projectSet.taxIncluded = c.taxIncluded;
          break;
        case "field":
          details = withField(details, c.key, c.to);
          break;
        case "contractNotes":
          details = { ...details, contractNotes: c.to };
          break;
        case "date": {
          const to = c.to;
          if (c.eventId) {
            await tx
              .update(calendarEvent)
              .set({ startDate: to.date, startTime: to.time || null })
              .where(and(eq(calendarEvent.id, c.eventId), eq(calendarEvent.talentId, talent.id), eq(calendarEvent.projectId, target.id)));
          } else if (signedAfter) {
            await tx.insert(calendarEvent).values({
              talentId: talent.id,
              projectId: target.id,
              kind: target.type === "gig" ? "performance" : "meeting",
              title: (to.what || target.title).slice(0, 200),
              startDate: to.date,
              startTime: to.time || null,
              timeZone: to.timeZone || timeZone,
            });
            if (c.index !== null) kept[c.index] = null; // now on the calendar
          } else if (c.index !== null) kept[c.index] = to;
          else kept.push(to);
          break;
        }
        case "stage":
          break;
        case "settlePayment": {
          const [p] = await tx
            .select()
            .from(payment)
            .where(and(eq(payment.id, c.paymentId), eq(payment.talentId, talent.id), eq(payment.projectId, target.id), eq(payment.status, "expected")))
            .for("update");
          if (!p) return fail("proposalChanged");
          const total = paymentTotal({ ...p, currency: "TWD" });
          await tx
            .update(payment)
            .set({
              status: "settled",
              settledOn: c.settledOn,
              settledAmount: c.amount === total ? null : c.amount, // null = the full total
              invoiceRef: p.invoiceRef || c.invoiceRef || null,
            })
            .where(eq(payment.id, p.id));
          break;
        }
        case "newPayment": {
          const settled = c.label === "received";
          await tx.insert(payment).values({
            talentId: talent.id,
            projectId: target.id,
            direction: "in",
            label: t(`payment.${c.label}`, { title: target.title }).slice(0, 200),
            amount: c.amount,
            taxIncluded: true,
            recordedOn: c.date,
            status: settled ? "settled" : "expected",
            settledOn: settled ? c.date : null,
          });
          break;
        }
        case "paymentNote": {
          const [p] = await tx
            .select({ notes: payment.notes })
            .from(payment)
            .where(and(eq(payment.id, c.paymentId), eq(payment.talentId, talent.id), eq(payment.projectId, target.id)));
          if (!p) return fail("proposalChanged");
          const notes = [p.notes, `${ctx.receivedOn} ${c.note}`].filter(Boolean).join("\n").slice(0, 10000);
          await tx.update(payment).set({ notes }).where(eq(payment.id, c.paymentId));
          break;
        }
        case "todo":
          await tx.insert(todo).values({
            talentId: talent.id,
            projectId: target.id,
            messageId: input.messageId,
            type: c.purpose === "reply" ? "reply" : c.purpose === "awaitContract" ? "follow_up" : "payment_due",
            title: t(`todo.${c.purpose}`, { title: target.title }).slice(0, 200),
            dueDate: c.dueDate,
            timeZone,
          });
          break;
        case "contractVersion": {
          // The latest version must still be the one this compared against; a newer one means re-check.
          const [latest] = await tx
            .select({ id: contract.id, version: contract.versionNumber, status: contract.status })
            .from(contract)
            .where(and(eq(contract.projectId, target.id), eq(contract.talentId, talent.id)))
            .orderBy(desc(contract.versionNumber))
            .limit(1)
            .for("update");
          const supersedes = latest && latest.status !== "void" ? latest.id : null;
          if ((latest?.version ?? 0) + 1 !== c.version || (c.supersedesId !== null && supersedes !== c.supersedesId)) return fail("proposalChanged");
          await tx.insert(contract).values({
            projectId: target.id,
            talentId: talent.id,
            messageId: input.messageId,
            versionNumber: c.version,
            supersedesId: c.supersedesId,
            status: c.status,
            terms: c.terms,
            diff: c.diff,
            signedAt: c.status === "signed" ? new Date() : null,
          });
          break;
        }
        case "toConfirm": {
          const items = [...(details.toConfirm ?? []), ...c.items.filter((i) => !details.toConfirm?.includes(i))];
          details = { ...details, toConfirm: items.slice(0, 50) };
          break;
        }
      }
    }

    details = { ...details, dates: kept.filter((d): d is ProjectDate => d !== null) };
    await tx
      .update(project)
      .set({ ...projectSet, details, stage: finalStage })
      .where(and(eq(project.id, target.id), eq(project.talentId, talent.id)));
    if (finalStage !== target.stage)
      await tx.insert(auditLog).values({
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "project.stage_changed",
        targetType: "project",
        targetId: target.id,
        details: { from: target.stage, to: finalStage },
      });
    // The project's timeline reads these: what this message changed, and what was left as a proposal.
    await tx.insert(auditLog).values({
      talentId: talent.id,
      actorPersonId: person.personId,
      action: "message.applied",
      targetType: "message",
      targetId: input.messageId,
      details: {
        projectId: target.id,
        applied,
        left: offered.filter((c) => !input.items[c.id]),
        stage: finalStage !== target.stage ? { from: target.stage, to: finalStage } : null,
      },
    });
    return null;
  });
  if (!failure) refresh();
  return failure;
}

const optional = (max: number) => z.string().trim().max(max).default("");
const projectDate = z.object({
  what: optional(200),
  date: day,
  time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  timeZone: optional(64),
});

const newProjectInput = z.object({
  messageId: z.uuid(),
  project: z.object({
    title: z.string().trim().min(1, "projectTitleRequired").max(200),
    type: z.enum(projectTypeKeys, "typeRequired"),
    counterparty: optional(200),
    quotedAmount: z.number().min(0).max(1e10).multipleOf(0.01).nullable(),
    taxRate: z.number().min(0).max(100, "taxRateRange").multipleOf(0.01),
    taxIncluded: z.boolean(),
    fields: z.record(z.string(), z.string().trim().max(1000)),
    dates: z.array(projectDate).max(20),
    notes: optional(10000),
  }),
  /** Link an existing contact, create one from the sender, or neither. */
  contact: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("link"), id: z.uuid() }),
      z.object({
        mode: z.literal("create"),
        name: z.string().trim().min(1, "nameRequired").max(200),
        company: optional(200),
        email: z.union([z.literal(""), z.email("emailInvalid")]),
        phone: optional(60),
      }),
    ])
    .nullable(),
  replyBy: z.union([z.literal(""), day]),
  toConfirm: z.array(z.string().trim().min(1).max(300)).max(20),
});
export type NewProjectInput = z.input<typeof newProjectInput>;

/**
 * Create a project from a message (建立新合作案): the project as the person
 * edited it, its contact, a reply to-do, and the to-confirm list, together.
 * Returns the new project's id, or an error.
 */
export async function createProjectFromMessage(raw: NewProjectInput): Promise<{ id: string } | { error: string }> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = newProjectInput.safeParse(raw);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.message;
    return { error: fail(key === "projectTitleRequired" || key === "nameRequired" || key === "emailInvalid" || key === "taxRateRange" ? key : "invalid") };
  }
  const input = parsed.data;
  const p = input.project;
  // Only the type's own fields are kept; a field from another type would have no label or home.
  const allowed = new Set(keptFields(p.type));
  let details: ProjectDetails = { dates: p.dates, toConfirm: input.toConfirm };
  for (const [key, value] of Object.entries(p.fields)) if (allowed.has(key) && value) details = withField(details, key, value);

  const t = await getTranslations("intake");
  const result = await db.transaction(async (tx): Promise<{ id: string } | { error: string }> => {
    const filed = await tx
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.id, input.messageId), eq(message.talentId, talent.id), eq(message.status, "analyzed")))
      .for("update");
    if (!filed.length) return { error: fail("messageNotFound") };

    let counterpartyId: string | null = null;
    let counterparty = p.counterparty;
    if (input.contact?.mode === "link") {
      const [linked] = await tx
        .select({ id: contact.id, name: contact.name })
        .from(contact)
        .where(and(eq(contact.id, input.contact.id), eq(contact.talentId, talent.id)));
      if (!linked) return { error: fail("counterpartyNotFound") };
      counterpartyId = linked.id;
      counterparty ||= linked.name;
    } else if (input.contact?.mode === "create") {
      const { name, company, email, phone } = input.contact;
      const [created] = await tx
        .insert(contact)
        .values({ talentId: talent.id, role: "counterparty", name, company: company || null, email: email || null, phone: phone || null })
        .returning({ id: contact.id });
      counterpartyId = created.id;
      counterparty ||= company || name;
    }

    const [created] = await tx
      .insert(project)
      .values({
        talentId: talent.id,
        title: p.title,
        counterparty,
        counterpartyId,
        type: p.type,
        stage: "offer",
        quotedAmount: p.quotedAmount,
        taxRate: p.taxRate,
        taxIncluded: p.taxIncluded,
        details,
        notes: p.notes || null,
      })
      .returning({ id: project.id });
    await tx.update(message).set({ projectId: created.id, status: "confirmed" }).where(eq(message.id, input.messageId));
    if (input.replyBy)
      await tx.insert(todo).values({
        talentId: talent.id,
        projectId: created.id,
        messageId: input.messageId,
        type: "reply",
        title: t("todo.reply", { title: p.title }).slice(0, 200),
        dueDate: input.replyBy,
        timeZone: (await getAppData()).talent.timeZone,
      });
    await tx.insert(auditLog).values([
      { talentId: talent.id, actorPersonId: person.personId, action: "project.created", targetType: "project", targetId: created.id },
      {
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "message.applied",
        targetType: "message",
        targetId: input.messageId,
        details: { projectId: created.id, created: true, contact: input.contact?.mode ?? null, replyBy: input.replyBy || null },
      },
    ]);
    return { id: created.id };
  });
  if (!("error" in result)) refresh();
  return result;
}

/** The reply-by default for messages that state none: N days after receiving (設定). */
export async function setReplyWithinDays(days: number): Promise<string | null> {
  const { person } = await requireTalent();
  const fail = await errorText();
  const parsed = z.number().int().min(0).max(30).safeParse(days);
  if (!parsed.success) return fail("invalid");
  await db.update(personTable).set({ replyWithinDays: parsed.data }).where(eq(personTable.id, person.personId));
  refresh();
  return null;
}
