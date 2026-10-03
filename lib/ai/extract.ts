import "server-only";
import type { Locale } from "@/lib/i18n/config";
import { modelOutput, normalize, type MessageAnalysis } from "./analysis";
import { generateObject } from "./model";
import { messagePrompt, PROMPT_VERSION, systemPrompt } from "./prompts";
import { findInstructions, stripInvisible, weekdayMismatches, type Flag } from "./safety";

/**
 * One message in, one analysis out: the prompt, the model call, and the
 * clean-up. The app (analyze-message.ts) and the evaluation script
 * (scripts/eval-extraction.mts) both go through here, so an eval measures
 * exactly what the app does.
 */
export async function extractMessage({
  body,
  today,
  timeZone,
  outputLocale,
}: {
  body: string;
  today: string; // YYYY-MM-DD in timeZone — the day the message was received
  timeZone: string;
  outputLocale: Locale;
}) {
  // Invisible characters can hide instructions a person can't see: remove them
  // before the model reads the text, and say so.
  const visible = stripInvisible(body);
  const { object, modelVersion } = await generateObject({
    system: systemPrompt({ today, timeZone, outputLocale }),
    prompt: messagePrompt(visible.text),
    schema: modelOutput,
  });
  const analysis = normalize(object);
  return { analysis: { ...analysis, flags: withChecks(analysis, visible) }, modelVersion, promptVersion: PROMPT_VERSION };
}

/**
 * The model's flags plus the deterministic checks', so a warning appears even
 * when the model misses — or obeys — an injected instruction.
 */
function withChecks(analysis: MessageAnalysis, visible: { text: string; removed: number }): Flag[] {
  const flags = [...analysis.flags];
  const has = (kind: Flag["kind"]) => flags.some((f) => f.kind === kind);
  if (visible.removed > 0) flags.push({ kind: "hidden_text", note: "", asStated: "", source: "check" });
  const instruction = findInstructions(visible.text);
  if (instruction && !has("instructions_to_ai"))
    flags.push({ kind: "instructions_to_ai", note: "", asStated: instruction, source: "check" });
  for (const d of weekdayMismatches(analysis.dates))
    if (!flags.some((f) => f.kind === "inconsistency" && f.asStated.includes(d.asStated)))
      flags.push({ kind: "inconsistency", note: "", asStated: d.asStated, source: "check" });
  return flags;
}
