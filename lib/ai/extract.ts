import "server-only";
import type { Locale } from "@/lib/i18n/config";
import { modelOutput, modelOutputForFiles, normalize, type MessageAnalysis } from "./analysis";
import { generateObject, ModelError, modelFor, type CallTrace, type ModelRole } from "./model";
import { messagePrompt, PROMPT_VERSION, SENT_PROMPT_VERSION, systemPrompt, type ThreadNote } from "./prompts";
import { findInstructions, relativeWeekday, rollForwardYearless, stripInvisible, weekdayMismatches, type Flag } from "./safety";

/** Over this many characters, a message goes to the large model. */
const LONG_MESSAGE = 8_000;
/** Below this confidence, the mid-size model's answer is asked again of the large one. */
const UNSURE = 0.5;

/**
 * One message in, one analysis out: the prompt, the model call, and the
 * clean-up. The app (analyze-message.ts) and the evaluation script
 * (scripts/eval-extraction.mts) both go through here, so an eval measures
 * exactly what the app does.
 */
export async function extractMessage({
  body,
  files = [],
  today,
  timeZone,
  outputLocale,
  trace,
  textIfFilesUnreadable = false,
  sent = false,
  thread = [],
  senderFailed = false,
}: {
  body: string;
  files?: { name: string; mimeType: string; data: Uint8Array }[]; // screenshots, photos, PDFs, in order
  today: string; // YYYY-MM-DD in timeZone — the day the message was received
  timeZone: string;
  outputLocale: Locale;
  trace: Omit<CallTrace, "promptVersion">; // what the call is for and whom (ai_call log)
  textIfFilesUnreadable?: boolean; // an email's files are extras: if the model can't read them, analyze its text alone
  sent?: boolean; // the person's own reply, read as their side of the deal (prompts.ts)
  thread?: ThreadNote[]; // earlier messages in its email thread, as background (prompts.ts)
  senderFailed?: boolean; // Gmail's checks failed on the sender's domain: warn, whatever the model says
}) {
  // Invisible characters can hide instructions a person can't see: remove them
  // before the model reads the text, and say so.
  const visible = stripInvisible(body);
  const request = {
    system: systemPrompt({ today, timeZone, outputLocale, sent }),
    prompt: messagePrompt(visible.text, outputLocale, files, thread),
    trace: { ...trace, promptVersion: sent ? SENT_PROMPT_VERSION : PROMPT_VERSION },
  };
  let transcriptWithheld = false;
  let filesNotRead = false;
  const ask = async (role: ModelRole) => {
    const asked = { ...request, role };
    if (!files.length) return generateObject({ ...asked, schema: modelOutput });
    try {
      return await generateObject({ ...asked, schema: modelOutputForFiles, attachments: files });
    } catch (e) {
      // A provider may refuse to write out text it recognizes as published
      // (lyrics, articles). Retrying the same request gets the same refusal;
      // asking without the transcript usually works.
      if (e instanceof ModelError && e.code === "unsupported_file" && textIfFilesUnreadable && visible.text.trim()) {
        // This model can't read these files: the text alone, and say so.
        filesNotRead = true;
        return generateObject({ ...asked, prompt: messagePrompt(visible.text, outputLocale, [], thread), schema: modelOutput });
      }
      if (!(e instanceof ModelError && e.code === "recitation")) throw e;
      transcriptWithheld = true;
      return generateObject({ ...asked, schema: modelOutput, attachments: files });
    }
  };
  // Which model (decision 0015): the large one for PDFs and long messages; the mid-size one
  // otherwise, and the large one again when its answer is unsure, a contract, or off-schema.
  const escalates = modelFor("analysis_complex").model !== modelFor("analysis").model;
  const hard = files.some((f) => f.mimeType === "application/pdf") || visible.text.length > LONG_MESSAGE;
  let result;
  if (hard || !escalates) result = await ask(hard ? "analysis_complex" : "analysis");
  else {
    try {
      result = await ask("analysis");
      const first = result.object as { confidence?: number; intent?: string };
      if ((first.confidence ?? 1) < UNSURE || first.intent === "contract") result = await ask("analysis_complex");
    } catch (e) {
      if (!(e instanceof ModelError && e.code === "invalid_output")) throw e;
      result = await ask("analysis_complex");
    }
  }
  const { object, modelVersion } = result;
  const normalized = normalize(object);
  // Dates follow the stated rules even when the model bends them: yearless dates roll forward, and
  // "next week's Monday" is counted in code: from the day it arrived, for text and email. Not for
  // screenshots, whose chat may be from another day.
  const fromToday = !files.length || textIfFilesUnreadable;
  const counted = (date: string, asStated: string) => (fromToday ? relativeWeekday(asStated, today) : null) ?? rollForwardYearless(date, asStated, today);
  const replyBy = counted(normalized.replyBy, normalized.replyByStated);
  const analysis = {
    ...normalized,
    dates: normalized.dates.map((d) => ({ ...d, date: counted(d.date, d.asStated) })),
    replyBy,
    // The model's note on how it counted a date it got wrong would now contradict the date shown.
    assumptions: replyBy !== normalized.replyBy ? normalized.assumptions.filter((x) => x.about !== "replyBy") : normalized.assumptions,
    transcriptWithheld,
    filesNotRead,
  };
  return { analysis: { ...analysis, flags: withChecks(analysis, visible, senderFailed) }, modelVersion, promptVersion: request.trace.promptVersion };
}

/**
 * The model's flags plus the deterministic checks', so a warning appears even
 * when the model misses — or obeys — an injected instruction.
 */
function withChecks(analysis: MessageAnalysis, visible: { text: string; removed: number }, senderFailed: boolean): Flag[] {
  const flags = [...analysis.flags];
  // First: the warning the rest should be read under.
  if (senderFailed) flags.unshift({ kind: "unverified_sender", note: "", asStated: "", source: "check" });
  const has = (kind: Flag["kind"]) => flags.some((f) => f.kind === kind);
  if (visible.removed > 0) flags.push({ kind: "hidden_text", note: "", asStated: "", source: "check" });
  // Text read from images and documents gets the same check as typed text.
  const instruction = findInstructions(`${visible.text}\n${analysis.transcript}`);
  if (instruction && !has("instructions_to_ai"))
    flags.push({ kind: "instructions_to_ai", note: "", asStated: instruction, source: "check" });
  for (const d of weekdayMismatches(analysis.dates))
    if (!flags.some((f) => f.kind === "inconsistency" && f.asStated.includes(d.asStated)))
      flags.push({ kind: "inconsistency", note: "", asStated: d.asStated, source: "check" });
  return flags;
}
