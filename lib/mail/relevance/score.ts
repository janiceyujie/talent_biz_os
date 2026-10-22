import "server-only";
import { generateObject, type CallTrace } from "@/lib/ai/model";
import { findInstructions, stripInvisible } from "@/lib/ai/safety";
import type { MailMetadata } from "../metadata";
import { RELEVANCE_PROMPT_VERSION, relevanceOutput, relevancePrompt, relevanceSystem, steersRelevance } from "./prompt";

/**
 * One email's score and kind from the relevance model. The worker
 * (lib/mail/jobs/relevance.ts) and the eval (scripts/eval-relevance.mts) both
 * go through here, so an eval measures exactly what the worker does.
 */
export async function scoreMail(m: Pick<MailMetadata, "from" | "subject" | "labels" | "snippet">, trace: Omit<CallTrace, "promptVersion">) {
  // Invisible characters can hide instructions: the model reads only what a person would see.
  const visible = { ...m, subject: stripInvisible(m.subject).text, snippet: stripInvisible(m.snippet).text };
  const { object, modelVersion } = await generateObject({
    role: "relevance",
    system: relevanceSystem(),
    prompt: relevancePrompt(visible),
    schema: relevanceOutput,
    trace: { ...trace, promptVersion: RELEVANCE_PROMPT_VERSION },
  });
  // Checked in code, whatever the model did with it: an email that tries to steer the check.
  const text = `${visible.subject}\n${visible.snippet}`;
  const steered = !!findInstructions(text) || steersRelevance(text);
  return { ...object, steered, modelVersion, promptVersion: RELEVANCE_PROMPT_VERSION };
}
