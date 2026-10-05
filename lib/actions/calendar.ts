"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { canonicalZone, isTimeZone } from "@/lib/time-zones";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvent, todo } from "@/lib/db/schema";
import { exactInstant } from "@/lib/domain/dates";
import { calendarKinds, transportModes, type CalendarKind } from "@/lib/types";
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


const optionalTime = z
  .union([z.literal(""), z.iso.time({ precision: -1, message: "timeInvalid" })])
  .optional()
  .transform((v) => v || null);
const short = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const itemInput = z.object({
  id: optionalId,
  source: z.enum(["event", "todo"]).optional(),
  kind: z.enum(calendarKinds, "kindRequired"),
  title: z.string().trim().min(1, "itemTitleRequired").max(200),
  date: z.iso.date("dateInvalid"),
  time: optionalTime,
  timeZone: z
    .string()
    .refine(isTimeZone, "timeZoneInvalid")
    .transform((v) => canonicalZone(v)!),
  // Travel and stays (see docs/architecture.md, "Travel and stays")
  endDate: z
    .union([z.literal(""), z.iso.date("dateInvalid")])
    .optional()
    .transform((v) => v || null),
  endTime: optionalTime,
  endTimeZone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || isTimeZone(v), "timeZoneInvalid")
    .transform((v) => v && canonicalZone(v)),
  transportMode: z
    .union([z.literal(""), z.enum(transportModes)])
    .optional()
    .transform((v) => v || null),
  operator: short(200),
  serviceNumber: short(100),
  destination: short(500),
  seat: short(100),
  hotelName: short(200),
  projectId: optionalId,
  location: optionalText,
  notes: optionalText,
  done: z.boolean().optional().default(false),
}).superRefine((e, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (e.kind !== "travel" && e.kind !== "accommodation") {
    // An ordinary event may end later the same day, in its own zone.
    if (e.endTime && !e.time) issue("timeInvalid");
    else if (e.endTime && e.time && e.endTime <= e.time) issue("endBeforeStart");
    return;
  }
  if (e.kind === "travel" && !e.transportMode) issue("transportModeRequired");
  if (e.kind === "accommodation" && !e.hotelName) issue("hotelNameRequired");
  if (!e.time) return issue("travelTimeRequired");
  // Compared as instants, so overnight and cross-date-line trips work; a wall
  // time skipped or repeated by daylight saving is refused, never guessed.
  const start = exactInstant(e.date, e.time, e.timeZone);
  if (start === null) return issue("wallTimeInvalid");
  const ends = [e.endDate, e.endTime, e.endTimeZone].filter(Boolean).length;
  if (ends === 0) return;
  if (ends < 3) return issue("endIncomplete");
  const end = exactInstant(e.endDate!, e.endTime!, e.endTimeZone!);
  if (end === null) return issue("wallTimeInvalid");
  if (end <= start) issue("endBeforeStart");
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
      ...travelColumns(input),
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

/** Travel and stay columns; other kinds store none. */
function travelColumns(input: z.infer<typeof itemInput>) {
  const travel = input.kind === "travel";
  const stay = input.kind === "accommodation";
  const keep = <T,>(on: boolean, v: T) => (on ? v : null);
  // An ordinary event's end is the same day and zone; only events (not to-dos) get here.
  const sameDayEnd = !travel && !stay && !!input.endTime;
  return {
    endDate: travel || stay ? input.endDate : sameDayEnd ? input.date : null,
    endTime: travel || stay || sameDayEnd ? input.endTime : null,
    endTimeZone: travel || stay ? input.endTimeZone : sameDayEnd ? input.timeZone : null,
    transportMode: keep(travel, input.transportMode),
    operator: keep(travel, input.operator),
    serviceNumber: keep(travel, input.serviceNumber),
    destination: keep(travel, input.destination),
    seat: keep(travel, input.seat),
    hotelName: keep(stay, input.hotelName),
  };
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
