"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvent, todo } from "@/lib/db/schema";
import { calendarKinds, type CalendarKind } from "@/lib/types";
import { checkProjectLink } from "./project-link";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

// Calendar kinds that are deadlines (to-dos) rather than things that happen
// at a time (calendar events), and the to-do type each one maps to.
const todoKinds: Partial<Record<CalendarKind, "custom" | "deliverable" | "payment_due">> = {
  todo: "custom",
  deliverable: "deliverable",
  payment: "payment_due",
};
const sourceOf = (kind: CalendarKind) => (kind in todoKinds ? "todo" : "event");

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const itemInput = z.object({
  id: optionalId,
  source: z.enum(["event", "todo"]).optional(),
  kind: z.enum(calendarKinds, "kindRequired"),
  title: z.string().trim().min(1, "itemTitleRequired").max(200),
  date: z.iso.date("dateInvalid"),
  time: z
    .union([z.literal(""), z.iso.time({ precision: -1, message: "timeInvalid" })])
    .optional()
    .transform((v) => v || null),
  timeZone: z.string().trim().refine(isTimeZone, "timeZoneInvalid"),
  projectId: optionalId,
  location: optionalText,
  notes: optionalText,
  done: z.boolean().optional().default(false),
});

/** Create or update a calendar item; its kind decides whether it's a to-do or an event. */
export async function saveCalendarItem(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = itemInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const target = sourceOf(input.kind);
  if (input.id && input.source && input.source !== target) return fail("kindSwitch");

  // Every calendar kind is execution work (events, deliverables, payment due,
  // custom to-dos), so a new project link needs a signed project. Reply and
  // follow-up to-dos come from messages, not this form.
  let currentLink: string | null = null;
  if (input.id) {
    const table = target === "todo" ? todo : calendarEvent;
    const [row] = await db
      .select({ projectId: table.projectId })
      .from(table)
      .where(and(eq(table.id, input.id), eq(table.talentId, talent.id)));
    currentLink = row?.projectId ?? null;
  }
  const linkError = await checkProjectLink(talent.id, input.projectId, currentLink);
  if (linkError) return fail(linkError);

  if (target === "todo") {
    const values = {
      projectId: input.projectId,
      type: todoKinds[input.kind]!,
      title: input.title,
      dueDate: input.date,
      dueTime: input.time,
      timeZone: input.timeZone,
      status: input.done ? ("done" as const) : ("open" as const),
      completedAt: input.done ? new Date() : null,
      notes: input.notes,
    };
    if (!input.id) await db.insert(todo).values({ ...values, talentId: talent.id });
    else {
      const rows = await db
        .update(todo)
        .set(values)
        .where(and(eq(todo.id, input.id), eq(todo.talentId, talent.id)))
        .returning({ id: todo.id });
      if (!rows.length) return fail("todoNotFound");
    }
  } else {
    const values = {
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      startDate: input.date,
      startTime: input.time,
      timeZone: input.timeZone,
      location: input.location,
      notes: input.notes,
    };
    if (!input.id) await db.insert(calendarEvent).values({ ...values, talentId: talent.id });
    else {
      const rows = await db
        .update(calendarEvent)
        .set(values)
        .where(and(eq(calendarEvent.id, input.id), eq(calendarEvent.talentId, talent.id)))
        .returning({ id: calendarEvent.id });
      if (!rows.length) return fail("eventNotFound");
    }
  }
  refresh();
  return null;
}

export async function setTodoDone(id: string, done: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(todo)
    .set({ status: done ? "done" : "open", completedAt: done ? new Date() : null })
    .where(and(eq(todo.id, id), eq(todo.talentId, talent.id)))
    .returning({ id: todo.id });
  if (!rows.length) return fail("todoNotFound");
  refresh();
  return null;
}

/** Archive or restore. A to-do is archived by dismissing it. */
export async function archiveCalendarItem(id: string, source: "event" | "todo", archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows =
    source === "todo"
      ? await db
          .update(todo)
          .set({ status: archived ? "dismissed" : "open", completedAt: null })
          .where(and(eq(todo.id, id), eq(todo.talentId, talent.id)))
          .returning({ id: todo.id })
      : await db
          .update(calendarEvent)
          .set({ archivedAt: archived ? new Date() : null })
          .where(and(eq(calendarEvent.id, id), eq(calendarEvent.talentId, talent.id)))
          .returning({ id: calendarEvent.id });
  if (!rows.length) return fail("itemNotFound");
  refresh();
  return null;
}
