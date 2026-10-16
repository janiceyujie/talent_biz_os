import "server-only";
import type { Locale } from "@/lib/i18n/config";
import { modelOutput, modelOutputForFiles, normalize, type MessageAnalysis } from "./analysis";
import { generateObject, ModelError, type CallTrace } from "./model";
import { messagePrompt, PROMPT_VERSION, systemPrompt } from "./prompts";
import { findInstructions, relativeWeekday, rollForwardYearless, stripInvisible, weekdayMismatches, type Flag } from "./safety";

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
  fromMailbox = false,
  textIfFilesUnreadable = false,
}: {
  body: string;
  files?: { name: string; mimeType: string; data: Uint8Array }[]; // screenshots, photos, PDFs, in order
  today: string; // YYYY-MM-DD in timeZone — the day the message was received
  timeZone: string;
  outputLocale: Locale;
  trace: Omit<CallTrace, "promptVersion">; // what the call is for and whom (ai_call log)
  fromMailbox?: boolean; // read from a connected mailbox: the mailbox model and the free-tier rule apply
  textIfFilesUnreadable?: boolean; // an email's files are extras: if the model can't read them, analyze its text alone
}) {
  // Invisible characters can hide instructions a person can't see: remove them
  // before the model reads the text, and say so.
  const visible = stripInvisible(body);
  const request = {
    fromMailbox,
    system: systemPrompt({ today, timeZone, outputLocale }),
    prompt: messagePrompt(visible.text, outputLocale, files),
    trace: { ...trace, promptVersion: PROMPT_VERSION },
  };
  let transcriptWithheld = false;
  let filesNotRead = false;
  let result;
  if (!files.length) result = await generateObject({ ...request, schema: modelOutput });
  else {
    try {
      result = await generateObject({ ...request, schema: modelOutputForFiles, attachments: files });
    } catch (e) {
      // A provider may refuse to write out text it recognizes as published
      // (lyrics, articles). Retrying the same request gets the same refusal;
      // asking without the transcript usually works.
      if (e instanceof ModelError && e.code === "unsupported_file" && textIfFilesUnreadable && visible.text.trim()) {
        // This model can't read these files (a local text-only model): the text alone, and say so.
        result = await generateObject({ ...request, prompt: messagePrompt(visible.text, outputLocale, []), schema: modelOutput });
        filesNotRead = true;
      } else {
        if (!(e instanceof ModelError && e.code === "recitation")) throw e;
        result = await generateObject({ ...request, schema: modelOutput, attachments: files });
        transcriptWithheld = true;
      }
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
  // Text read from images and documents gets the same check as typed text.
  const instruction = findInstructions(`${visible.text}\n${analysis.transcript}`);
  if (instruction && !has("instructions_to_ai"))
    flags.push({ kind: "instructions_to_ai", note: "", asStated: instruction, source: "check" });
  for (const d of weekdayMismatches(analysis.dates))
    if (!flags.some((f) => f.kind === "inconsistency" && f.asStated.includes(d.asStated)))
      flags.push({ kind: "inconsistency", note: "", asStated: d.asStated, source: "check" });
  return flags;
}
