// A saved message's content (assistant_message.content, decision 0023): a
// question as asked, or an answer as data, with a version so a later shape can
// be read beside this one without migrating rows. Validated when read: a
// message that doesn't parse is shown as one that can't be, rather than
// breaking its conversation. Pure, no server-only imports.
import { z } from "zod";
import { supportedCurrencies } from "@/lib/domain/money";
import { calendarKinds } from "@/lib/types";
import { assistantIntents, QUESTION_MAX, type AssistantAnswer, type AssistantIntent } from "./answers";

export type Question = { intent: AssistantIntent } | { text: string; projectId?: string };

const question = z.union([
  z.object({ intent: z.enum(assistantIntents) }),
  z.object({ text: z.string().min(1).max(QUESTION_MAX), projectId: z.uuid().optional() }),
]);

const currency = z.enum(supportedCurrencies);
const totals = z.array(z.object({ currency, amount: z.number() }));
const answer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("schedule"),
    date: z.string(),
    timeZone: z.string(),
    lines: z.array(
      z.object({
        start: z.string(),
        end: z.string(),
        title: z.string(),
        kind: z.enum(calendarKinds),
        project: z.string(),
        amount: z.object({ value: z.number(), currency }).nullable(),
      }),
    ),
    more: z.number(),
  }),
  z.object({
    kind: z.literal("money"),
    direction: z.enum(["in", "out"]),
    today: z.string(),
    totals,
    overdue: totals,
    lines: z.array(
      z.object({ label: z.string(), project: z.string(), dueDate: z.string().nullable(), amount: z.number(), currency, overdue: z.boolean() }),
    ),
    more: z.number(),
  }),
]) satisfies z.ZodType<AssistantAnswer>;

export const CONTENT_VERSION = 1;
const userContent = z.object({ v: z.literal(1), question });
const assistantContent = z.object({ v: z.literal(1), answer });

export const questionContent = (q: Question) => ({ v: CONTENT_VERSION, question: q });
export const answerContent = (a: AssistantAnswer) => ({ v: CONTENT_VERSION, answer: a });

/** A saved message as the screens show it; `unreadable` when its content doesn't parse. */
export type SavedLine =
  | { id: string; role: "user"; question: Question; at: string }
  | { id: string; role: "assistant"; answer: AssistantAnswer; at: string }
  | { id: string; role: "user" | "assistant"; unreadable: true; at: string };

export function savedLine(row: { id: string; role: "user" | "assistant"; content: unknown; createdAt: Date }): SavedLine {
  const at = row.createdAt.toISOString();
  if (row.role === "user") {
    const parsed = userContent.safeParse(row.content);
    return parsed.success ? { id: row.id, role: "user", question: parsed.data.question, at } : { id: row.id, role: "user", unreadable: true, at };
  }
  const parsed = assistantContent.safeParse(row.content);
  return parsed.success ? { id: row.id, role: "assistant", answer: parsed.data.answer, at } : { id: row.id, role: "assistant", unreadable: true, at };
}

/** Earlier turns for the model: text only, newest last, each and all capped, so history can't outgrow a call's cost limit. */
export const HISTORY_TURNS = 6;
const HISTORY_ITEM_MAX = 1500;
const HISTORY_MAX = 6000;
export function historyFor(lines: SavedLine[]): { role: "user" | "assistant"; text: string }[] {
  const items = lines
    .filter((l): l is Exclude<SavedLine, { unreadable: true }> => !("unreadable" in l))
    .slice(-HISTORY_TURNS)
    .map((l) => ({
      role: l.role,
      // A quick prompt is named by its intent; a code-worked answer goes as its data.
      text: (l.role === "user" ? ("intent" in l.question ? `[quick prompt: ${l.question.intent}]` : l.question.text) : l.answer.kind === "text" ? l.answer.text : JSON.stringify(l.answer)).slice(0, HISTORY_ITEM_MAX),
    }));
  // Over the total, drop the oldest first.
  while (items.length && items.reduce((n, i) => n + i.text.length, 0) > HISTORY_MAX) items.shift();
  return items;
}

/** A conversation's title: its first question, on one line, cut short. */
export const titleOf = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
};
