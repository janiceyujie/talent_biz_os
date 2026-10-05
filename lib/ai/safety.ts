// Deterministic safety checks around message analysis. Message content is
// untrusted (docs/decisions/0007): these run whatever the model does, so a
// model that misses or obeys an injected instruction still leaves a visible
// warning for the person. Pure functions; no server-only imports.

export const flagKinds = ["instructions_to_ai", "payment_details", "inconsistency", "hidden_text", "other"] as const;
export type FlagKind = (typeof flagKinds)[number];
/** Something the person should look at before trusting the analysis. `note` is the model's words, if it raised it. */
export type Flag = { kind: FlagKind; note: string; asStated: string; source: "model" | "check" };

// Characters that render as nothing: zero-width spaces and joiners (except the
// emoji joiner U+200D), bidirectional overrides, word joiners, the BOM, and
// Unicode "tag" characters (U+E0000–E007F), which can carry a hidden ASCII
// message a person can't see but a model can read.
const invisible = /[​‌‎‏‪-‮⁠-⁤﻿]|[\u{E0000}-\u{E007F}]/gu;

/** The text with invisible characters removed; `removed` counts UTF-16 code units (non-zero means some were there). */
export function stripInvisible(text: string) {
  const cleaned = text.replace(invisible, "");
  return { text: cleaned, removed: text.length - cleaned.length };
}

// Phrases that address an AI or try to change how the message is processed.
// Conservative on purpose: a false alarm costs a glance, a miss costs trust.
const instructionPatterns = [
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?|directions?)/i,
  /disregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)?\s*(instructions?|rules?|prompts?)/i,
  /\b(system|developer)\s+(prompt|instructions?)\b/i,
  /\bdeveloper\s+message\b/i,
  /\b(ai|llm|language model|chatbot|gpt|claude|gemini)\b[^.\n]{0,40}\b(classify|mark|treat|set|change|output|respond|reply|say|ignore)\b/i,
  /\b(attention|note|instructions?)\s+(to|for)\s+(the\s+)?(ai|assistant|model|bot)\b/i,
  /忽略(之前|以上|前面|先前|所有|上述)[^。\n]{0,10}(指令|規則|指示|設定|提示)/,
  /(系統|系统)(指令|提示|訊息|消息)/,
  /(給|致|對|请|請)\s*(AI|ai|人工智慧|人工智能|機器人|助理|助手)[^。\n]{0,20}(標記|設定|設為|改成|分類|回覆|忽略|輸出)/,
];

/** An instruction aimed at an AI, with a little surrounding text, or null. */
export function findInstructions(text: string) {
  for (const pattern of instructionPatterns) {
    const m = pattern.exec(text);
    if (m) return text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 20).trim();
  }
  return null;
}

const zhWeekday: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const enWeekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The weekday a phrase states ("（五）", "週五", "Friday"), or null. 0 = Sunday. */
export function statedWeekday(phrase: string) {
  const zh = /(?:[（(]\s*|週|周|星期|禮拜)([一二三四五六日天])/.exec(phrase);
  if (zh) return zhWeekday[zh[1]];
  const en = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i.exec(phrase);
  return en ? enWeekday.indexOf(en[1].toLowerCase()) : null;
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Month and day a phrase states without a year ("12/24", "11月21日", "November 21", "21 Nov"), or null. */
function yearlessMonthDay(phrase: string) {
  if (/\d{4}/.test(phrase)) return null;
  const numeric = /(\d{1,2})\s*[/月.-]\s*(\d{1,2})/.exec(phrase);
  if (numeric) return { month: Number(numeric[1]), day: Number(numeric[2]) };
  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b|\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(phrase);
  if (!named) return null;
  return { month: months.indexOf((named[1] ?? named[4]).toLowerCase()) + 1, day: Number(named[2] ?? named[3]) };
}

/**
 * Fixes yearless dates a model placed months in the past ("12/24（三）" put in
 * the previous year, where it falls on a Wednesday): they move to this year's
 * occurrence when that's upcoming or recent, otherwise next year's. Recent past
 * references ("the shoot on 9/28") are left alone. Run the weekday check after
 * this, on the result.
 */
export function rollForwardYearless(date: string, asStated: string, today: string) {
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);
  if (!date || date >= cutoff.toISOString().slice(0, 10)) return date;
  const md = yearlessMonthDay(asStated);
  if (!md || md.month !== Number(date.slice(5, 7)) || md.day !== Number(date.slice(8, 10))) return date;
  // This year's occurrence if it's upcoming or within the last six months (a
  // recent reference), otherwise next year's.
  const monthDay = date.slice(4); // "-12-24"
  const thisYear = `${today.slice(0, 4)}${monthDay}`;
  return thisYear >= cutoff.toISOString().slice(0, 10) ? thisYear : `${Number(today.slice(0, 4)) + 1}${monthDay}`;
}

/** Dates whose stated weekday doesn't match the date ("11/14（五）" when 11/14 is a Saturday). */
export function weekdayMismatches<D extends { date: string; asStated: string }>(dates: readonly D[]) {
  return dates.filter((d) => {
    if (!d.date || !d.asStated) return false;
    const stated = statedWeekday(d.asStated);
    return stated !== null && stated !== new Date(`${d.date}T12:00:00Z`).getUTCDay();
  });
}

/** For a weekday warning: the date, the weekday it falls on, and the one the message states (0 = Sunday). */
export function weekdayMismatchOf(dates: readonly { date: string; asStated: string }[], asStated: string) {
  const d = weekdayMismatches(dates).find((x) => x.asStated === asStated);
  if (!d) return null;
  return { date: d.date, actual: new Date(`${d.date}T12:00:00Z`).getUTCDay(), stated: statedWeekday(d.asStated)! };
}
