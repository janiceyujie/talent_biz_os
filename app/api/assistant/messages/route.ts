import { z } from "zod";
import { assistantIntents, dayOf, moneyAnswer, scheduleAnswer } from "@/lib/assistant/answers";
import { moneySource, scheduleSource, talentOf } from "@/lib/assistant/data";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { dateInZone } from "@/lib/domain/dates";

// For now a message is a quick prompt's intent, answered in code. Free-text
// questions (a model call) and saved conversations come next (decision 0023).
const body = z.object({ intent: z.enum(assistantIntents) });

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
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { intent } = parsed.data;
  const { timeZone } = await talentOf(current.id);
  const today = dateInZone(timeZone);
  let answer;
  if (intent === "today" || intent === "tomorrow") {
    const day = dayOf(intent, today);
    answer = scheduleAnswer(await scheduleSource(current.id, session.personId, day), day);
  } else {
    const { payments, projects } = await moneySource(current.id);
    answer = moneyAnswer(payments, projects, today, intent === "receivable" ? "in" : "out");
  }
  return Response.json({ answer }, { headers: { "Cache-Control": "private, no-store" } });
}
