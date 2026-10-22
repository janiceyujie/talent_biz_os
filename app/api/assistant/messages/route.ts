import { sql } from "drizzle-orm";
import { z } from "zod";
import { generateText, ModelError } from "@/lib/ai/model";
import { stripInvisible } from "@/lib/ai/safety";
import { assistantUsage } from "@/lib/ai/usage";
import { assistantIntents, dayOf, moneyAnswer, QUESTION_MAX, scheduleAnswer } from "@/lib/assistant/answers";
import { moneySource, overviewSource, projectSource, scheduleSource, talentOf } from "@/lib/assistant/data";
import { ASSISTANT_PROMPT_VERSION, assistantPrompt, assistantSystem } from "@/lib/assistant/prompt";
import { cleanSnapshot, overviewSnapshot, projectSnapshot } from "@/lib/assistant/snapshot";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInZone, wallTimeToUtc } from "@/lib/domain/dates";
import { toLocale } from "@/lib/i18n/config";

// A quick prompt's intent, answered in code; or a question in the person's own
// words, answered by the model from a snapshot of the workspace or of one
// project (decision 0023). One question at a time, no history yet: saved
// conversations come next.
const body = z.union([
  z.object({ intent: z.enum(assistantIntents) }),
  z.object({ text: z.string().trim().min(1).max(QUESTION_MAX), projectId: z.uuid().optional() }),
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
  const { timeZone } = await talentOf(current.id);
  const today = dateInZone(timeZone);

  if ("intent" in parsed.data) {
    const { intent } = parsed.data;
    if (intent === "today" || intent === "tomorrow") {
      const day = dayOf(intent, today);
      return json({ answer: scheduleAnswer(await scheduleSource(current.id, session.personId, day, day), day) });
    }
    const { payments, projects } = await moneySource(current.id);
    return json({ answer: moneyAnswer(payments, projects, today, intent === "receivable" ? "in" : "out") });
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
    const { snapshot, flags } = cleanSnapshot("project" in source ? projectSnapshot(source) : overviewSnapshot(source));
    try {
      const { text: answer } = await generateText({
        role: "assistant",
        system: assistantSystem(toLocale(session.locale)),
        prompt: assistantPrompt(snapshot, stripInvisible(text).text),
        trace: { task: "assistant", promptVersion: ASSISTANT_PROMPT_VERSION, talentId: current.id, personId: session.personId, flags },
      });
      return json({ answer: { kind: "text", text: answer.trim() }, monthLeft: usage.monthLeft - 1 });
    } catch (e) {
      // Ids and codes only: never the question or the data.
      console.error("assistant failed", session.personId, e instanceof ModelError ? e.code : (e as Error)?.name);
      return json({ error: "unavailable" }, 503);
    }
  });
}
