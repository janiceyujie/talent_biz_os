"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, opportunity, opportunityApplication, opportunityTask, todo } from "@/lib/db/schema";
import { applicationStages, taskKinds } from "@/lib/opportunities/types";
import { canonicalZone, isTimeZone } from "@/lib/time-zones";
import { checkProjectLink } from "./project-link";
import { errorText } from "./validation";

// Following calls and the applications that follow from it (decision 0024).
// An application's to-dos are ordinary to-dos, so Today and the Calendar show
// them and they keep one date. Following never makes a project or money.

const when = {
  date: z.iso.date(),
  time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
  timeZone: z.string().refine(isTimeZone),
};
const taskInput = z.object({ kind: z.enum(taskKinds), title: z.string().trim().min(1).max(200), ...when });

/** Follow a call: an application at Preparing, and a Submit to-do when a date is given. Following twice does nothing. */
export async function followOpportunity(id: string, submit?: unknown): Promise<string | null> {
  const { talent, person } = await requireTalent();
  const fail = await errorText();
  const t = await getTranslations("opportunities");
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const plan = submit === undefined ? null : z.object(when).safeParse(submit);
  if (plan && !plan.success) return fail("invalid");
  const [call] = await db
    .select({ title: opportunity.title, url: opportunity.url, opensOn: opportunity.opensOn, closesOn: opportunity.closesOn })
    .from(opportunity)
    .where(eq(opportunity.id, id));
  if (!call) return fail("opportunityNotFound");
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(opportunityApplication)
      .values({ talentId: talent.id, opportunityId: id, createdBy: person.personId, knownOpensOn: call.opensOn, knownClosesOn: call.closesOn })
      .onConflictDoNothing()
      .returning({ id: opportunityApplication.id });
    if (!created) return;
    if (plan?.success) {
      const [task] = await tx
        .insert(todo)
        .values({
          talentId: talent.id,
          type: "custom",
          title: `${t("tasks.submission")} · ${call.title}`.slice(0, 200),
          dueDate: plan.data.date,
          dueTime: plan.data.time || null,
          timeZone: canonicalZone(plan.data.timeZone)!,
          notes: call.url,
        })
        .returning({ id: todo.id });
      await tx.insert(opportunityTask).values({ applicationId: created.id, todoId: task.id, kind: "submission" });
    }
    await tx.insert(auditLog).values({ talentId: talent.id, actorPersonId: person.personId, action: "opportunity.followed", targetType: "opportunity_application", targetId: created.id });
  });
  refresh();
  return null;
}

/**
 * Stop following a call still at Preparing (decision 0024): the application,
 * its stage and notes go; its open to-dos are dismissed, so they leave Today
 * and the Calendar but aren't lost; its done ones stay as they are. Past
 * Preparing it's a record of having applied, so it's set to Closed instead.
 */
export async function unfollowOpportunity(applicationId: string): Promise<string | null> {
  const { talent, person } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(applicationId).success) return fail("invalid");
  const mine = and(eq(opportunityApplication.id, applicationId), eq(opportunityApplication.talentId, talent.id));
  const failure = await db.transaction(async (tx) => {
    const [app] = await tx.select().from(opportunityApplication).where(mine).for("update");
    if (!app) return fail("applicationNotFound");
    if (app.stage !== "preparing") return fail("unfollowPreparingOnly");
    const links = await tx.select({ id: opportunityTask.todoId }).from(opportunityTask).where(eq(opportunityTask.applicationId, app.id));
    const dismissed = links.length
      ? await tx
          .update(todo)
          .set({ status: "dismissed" })
          .where(and(inArray(todo.id, links.map((l) => l.id)), eq(todo.talentId, talent.id), eq(todo.status, "open")))
          .returning({ id: todo.id })
      : [];
    await tx.delete(opportunityApplication).where(mine);
    await tx.insert(auditLog).values({
      talentId: talent.id,
      actorPersonId: person.personId,
      action: "opportunity.unfollowed",
      targetType: "opportunity_application",
      targetId: app.id,
      details: { opportunityId: app.opportunityId, dismissedTodos: dismissed.map((d) => d.id) },
    });
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** An application's stage, notes, and project; its to-dos move to the same project. */
export async function updateApplication(data: unknown): Promise<string | null> {
  const { talent, person } = await requireTalent();
  const fail = await errorText();
  const parsed = z
    .object({
      id: z.uuid(),
      stage: z.enum(applicationStages),
      projectId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
      notes: z.string().trim().max(10000),
    })
    .safeParse(data);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(opportunityApplication)
      .where(and(eq(opportunityApplication.id, input.id), eq(opportunityApplication.talentId, talent.id)))
      .for("update");
    if (!existing) return fail("applicationNotFound");
    const linkError = await checkProjectLink(talent.id, input.projectId, existing.projectId);
    if (linkError) return fail(linkError);
    await tx
      .update(opportunityApplication)
      .set({ stage: input.stage, projectId: input.projectId, notes: input.notes })
      .where(and(eq(opportunityApplication.id, input.id), eq(opportunityApplication.talentId, talent.id)));
    if (input.projectId !== existing.projectId) {
      const links = await tx.select({ id: opportunityTask.todoId }).from(opportunityTask).where(eq(opportunityTask.applicationId, input.id));
      for (const link of links) await tx.update(todo).set({ projectId: input.projectId }).where(and(eq(todo.id, link.id), eq(todo.talentId, talent.id)));
    }
    if (input.stage !== existing.stage || input.projectId !== existing.projectId) {
      await tx.insert(auditLog).values({
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "opportunity.application_updated",
        targetType: "opportunity_application",
        targetId: input.id,
        details: { from: existing.stage, to: input.stage, projectId: input.projectId },
      });
    }
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Add a to-do to an application. `requestId` makes a repeated submit add it once. */
export async function addApplicationTask(data: unknown): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const t = await getTranslations("opportunities");
  const parsed = taskInput.extend({ requestId: z.uuid(), applicationId: z.uuid() }).safeParse(data);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const [app] = await tx
      .select()
      .from(opportunityApplication)
      .where(and(eq(opportunityApplication.id, input.applicationId), eq(opportunityApplication.talentId, talent.id)))
      .for("update");
    if (!app) return fail("applicationNotFound");
    const [repeated] = await tx.select({ id: opportunityTask.id }).from(opportunityTask).where(eq(opportunityTask.id, input.requestId));
    if (repeated) return null;
    const linkError = await checkProjectLink(talent.id, app.projectId, app.projectId);
    if (linkError) return fail(linkError);
    const [call] = await tx.select({ title: opportunity.title, url: opportunity.url }).from(opportunity).where(eq(opportunity.id, app.opportunityId));
    const [created] = await tx
      .insert(todo)
      .values({
        talentId: talent.id,
        projectId: app.projectId,
        type: "custom",
        title: input.title,
        dueDate: input.date,
        dueTime: input.time || null,
        timeZone: canonicalZone(input.timeZone)!,
        notes: `${t("taskContext")}\n${call.title}\n${call.url}`,
      })
      .returning({ id: todo.id });
    await tx.insert(opportunityTask).values({ id: input.requestId, applicationId: app.id, todoId: created.id, kind: input.kind });
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Change one of an application's to-dos: the to-do itself, so the Calendar and Today keep one date. */
export async function updateApplicationTask(data: unknown): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = taskInput.extend({ applicationId: z.uuid(), taskId: z.uuid() }).safeParse(data);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const [app] = await tx
      .select()
      .from(opportunityApplication)
      .where(and(eq(opportunityApplication.id, input.applicationId), eq(opportunityApplication.talentId, talent.id)))
      .for("update");
    if (!app) return fail("applicationNotFound");
    const [link] = await tx
      .select()
      .from(opportunityTask)
      .where(and(eq(opportunityTask.todoId, input.taskId), eq(opportunityTask.applicationId, app.id)));
    if (!link) return fail("todoNotFound");
    const rows = await tx
      .update(todo)
      .set({ title: input.title, dueDate: input.date, dueTime: input.time || null, timeZone: canonicalZone(input.timeZone)! })
      .where(and(eq(todo.id, link.todoId), eq(todo.talentId, talent.id)))
      .returning({ id: todo.id });
    if (!rows.length) return fail("todoNotFound");
    await tx.update(opportunityTask).set({ kind: input.kind }).where(eq(opportunityTask.id, link.id));
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/**
 * A followed call's new dates, seen (decision 0024): the dates the person
 * saw become the known ones, which ends the notification. With `moveSubmit`,
 * the open Submit to-do moves to the new closing date; it's never moved
 * otherwise. Dates that changed again since are refused, so nothing moves to
 * a date the person didn't see.
 */
export async function acceptOpportunityDates(data: unknown): Promise<string | null> {
  const { talent, person } = await requireTalent();
  const fail = await errorText();
  const day = z.union([z.iso.date(), z.literal("")]).transform((v) => v || null);
  const parsed = z.object({ applicationId: z.uuid(), opensOn: day, closesOn: day, moveSubmit: z.boolean() }).safeParse(data);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const [app] = await tx
      .select({ id: opportunityApplication.id, knownOpensOn: opportunityApplication.knownOpensOn, knownClosesOn: opportunityApplication.knownClosesOn, opensOn: opportunity.opensOn, closesOn: opportunity.closesOn })
      .from(opportunityApplication)
      .innerJoin(opportunity, eq(opportunity.id, opportunityApplication.opportunityId))
      .where(and(eq(opportunityApplication.id, input.applicationId), eq(opportunityApplication.talentId, talent.id)))
      .for("update", { of: opportunityApplication });
    if (!app) return fail("applicationNotFound");
    if (app.opensOn !== input.opensOn || app.closesOn !== input.closesOn) return fail("opportunityChanged");
    let moved: string | null = null;
    if (input.moveSubmit) {
      if (!app.closesOn) return fail("invalid");
      const [submit] = await tx
        .select({ id: todo.id })
        .from(opportunityTask)
        .innerJoin(todo, and(eq(todo.id, opportunityTask.todoId), eq(todo.talentId, talent.id), eq(todo.status, "open")))
        .where(and(eq(opportunityTask.applicationId, app.id), eq(opportunityTask.kind, "submission")))
        .orderBy(asc(opportunityTask.createdAt))
        .limit(1);
      if (!submit) return fail("todoNotFound");
      await tx.update(todo).set({ dueDate: app.closesOn }).where(and(eq(todo.id, submit.id), eq(todo.talentId, talent.id)));
      moved = submit.id;
    }
    await tx
      .update(opportunityApplication)
      .set({ knownOpensOn: app.opensOn, knownClosesOn: app.closesOn })
      .where(and(eq(opportunityApplication.id, app.id), eq(opportunityApplication.talentId, talent.id)));
    await tx.insert(auditLog).values({
      talentId: talent.id,
      actorPersonId: person.personId,
      action: "opportunity.dates_seen",
      targetType: "opportunity_application",
      targetId: app.id,
      details: { from: { opensOn: app.knownOpensOn, closesOn: app.knownClosesOn }, to: { opensOn: app.opensOn, closesOn: app.closesOn }, movedTodoId: moved },
    });
    return null;
  });
  if (!failure) refresh();
  return failure;
}
