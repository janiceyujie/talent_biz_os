import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { generateText, ModelError } from "@/lib/ai/model";
import { stripInvisible } from "@/lib/ai/safety";
import { assistantUsage } from "@/lib/ai/usage";
import { assistantIntents, dayOf, moneyAnswer, promptKeys, QUESTION_MAX, scheduleAnswer, type AssistantAnswer } from "@/lib/assistant/answers";
import { historyFor } from "@/lib/assistant/content";
import { canContinue, getConversation, saveTurn } from "@/lib/assistant/conversations";
import { moneySource, overviewSource, projectSource, scheduleSource, talentOf } from "@/lib/assistant/data";
import { ASSISTANT_PROMPT_VERSION, assistantPrompt, assistantSystem } from "@/lib/assistant/prompt";
import { cleanSnapshot, overviewSnapshot, projectSnapshot } from "@/lib/assistant/snapshot";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInZone, wallTimeToUtc } from "@/lib/domain/dates";
import { toLocale } from "@/lib/i18n/config";

// A quick prompt's intent, answered in code; or a question in the person's own
// words, answered by the model from a snapshot of the workspace or of one
// project, with the conversation's last turns (decision 0023). Each answered
// question is saved to the conversation named, or to a new one.
const conversation = { conversationId: z.uuid().optional() };
const body = z.union([
  z.object({ intent: z.enum(assistantIntents), ...conversation }),
  z.object({ text: z.string().trim().min(1).max(QUESTION_MAX), projectId: z.uuid().optional(), ...conversation }),
]);

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** One message to the assistant from the signed-in person, about the talent they're working on; the answer. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  // JSON only: another site can't send it without a CORS preflight, which this route never answers,
  // so a page elsewhere can't post here with the person's cookie (server functions check this for themselves).
  if (!req.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported Media Type", { status: 415 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { conversationId } = parsed.data;
  // Only the person's own conversation about this talent: anything else is "not found".
  if (conversationId && !(await canContinue(session.personId, current.id, conversationId))) return json({ error: "not_found" }, 404);
  const { timeZone } = await talentOf(current.id);
  const today = dateInZone(timeZone);
  const save = (tx: Parameters<typeof saveTurn>[0], question: Parameters<typeof saveTurn>[1]["question"], answer: AssistantAnswer, title: string) =>
    saveTurn(tx, { personId: session.personId, talentId: current.id, conversationId, question, answer, title });

  if ("intent" in parsed.data) {
    const { intent } = parsed.data;
    let answer: AssistantAnswer;
    if (intent === "today" || intent === "tomorrow") {
      const day = dayOf(intent, today);
      answer = scheduleAnswer(await scheduleSource(current.id, session.personId, day, day), day);
    } else {
      const { payments, projects } = await moneySource(current.id);
      answer = moneyAnswer(payments, projects, today, intent === "receivable" ? "in" : "out");
    }
    // Titled as the button reads, in the person's language.
    const t = await getTranslations({ locale: toLocale(session.locale), namespace: "assistant.prompt" });
    const id = await db.transaction((tx) => save(tx, { intent }, answer, t(promptKeys[intent])));
    return json({ conversationId: id, answer });
  }

  const { text, projectId } = parsed.data;
  // One question at a time per person, across machines: the lock lasts as long as this transaction.
  return db.transaction(async (tx) => {
    const [{ locked }] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${"assistant:" + session.personId})) as locked`)) as unknown as {
      locked: boolean;
    }[];
    if (!locked) return json({ error: "busy" }, 429);

    // The month starts on the 1st where the talent is.
    const usage = await assistantUsage(session.personId, wallTimeToUtc(`${today.slice(0, 8)}01`, "00:00", timeZone));
    if (usage.left <= 0) return json({ error: usage.monthLeft <= 0 ? "month_limit" : "day_limit" }, 429);

    const source = projectId ? await projectSource(current.id, session.personId, projectId, today) : await overviewSource(current.id, session.personId, today);
    if (!source) return json({ error: "not_found" }, 404); // not this talent's project: the same answer as one that doesn't exist
    // Earlier turns are cleaned and checked like the snapshot: they may quote what a message said.
    const earlier = conversationId ? historyFor((await getConversation(session.personId, current.id, conversationId))?.lines ?? []) : [];
    const workspace = cleanSnapshot("project" in source ? projectSnapshot(source) : overviewSnapshot(source));
    const history = cleanSnapshot({ history: earlier });
    const flags = [...workspace.flags, ...history.flags];
    const question = stripInvisible(text).text;
    try {
      const { text: reply } = await generateText({
        role: "assistant",
        system: assistantSystem(toLocale(session.locale)),
        prompt: assistantPrompt(workspace.snapshot, question, history.snapshot.history),
        trace: { task: "assistant", promptVersion: ASSISTANT_PROMPT_VERSION, talentId: current.id, personId: session.personId, flags },
      });
      const answer: AssistantAnswer = { kind: "text", text: reply.trim() };
      const id = await save(tx, { text: question, ...(projectId ? { projectId } : {}) }, answer, question);
      return json({ conversationId: id, answer, monthLeft: usage.monthLeft - 1 });
    } catch (e) {
      // Ids and codes only: never the question or the data.
      console.error("assistant failed", session.personId, e instanceof ModelError ? e.code : (e as Error)?.name);
      return json({ error: "unavailable" }, 503);
    }
  });
}
