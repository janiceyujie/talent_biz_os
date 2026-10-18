// Checking what the model read from a notice against the notice itself: a
// field is kept only when code finds it in the masked text, so a misread or
// made-up number can't get through (decision 0013). Pure, no server-only imports.
import { z } from "zod";
import type { NoticeFields } from "./fields";

export const noticeOutput = z.object({
  direction: z.enum(["in", "out", "unknown"]), // in: money arrived in the person's account
  amount: z.number().nullable(),
  currency: z.string().nullable(), // ISO 4217
  date: z.string().nullable(), // YYYY-MM-DD
  payer: z.string().nullable(),
  last4: z.string().nullable(),
});
export type NoticeOutput = z.infer<typeof noticeOutput>;

/** Every number written in the text, commas removed. */
const numbersIn = (text: string) => new Set([...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))));

const collapse = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

const currencyNames: Record<string, string> = { NTD: "TWD", NT: "TWD", "NT$": "TWD", RMB: "CNY" };
// How a currency may be written, besides its code.
const currencySigns: Record<string, RegExp> = {
  TWD: /NT\$|NTD|TWD|新臺幣|新台幣|台幣|臺幣|元/i,
  USD: /USD|US\$/i,
  JPY: /JPY|日圓|日幣|円/i,
  EUR: /EUR|€/i,
  CNY: /CNY|RMB|人民幣/i,
  HKD: /HKD|HK\$|港幣/i,
};

// Words that say which way money moved. When a notice uses only one side's, code decides,
// whatever the model said: a small model reads a card charge as money in.
const outWords = /消費|刷卡|扣款|扣繳|轉出|提款|繳費|支出|you spent|you sent|you paid|charged|purchase|withdrawal|debited|payment to/i;
const inWords = /入帳|匯入|轉入|存入|收款|收到|入金|received|deposit|credited|sent you|paid you/i;

/** Which way the money moved, from the notice's own words when they're one-sided; otherwise the model's reading. */
export function directionOf(text: string, model: NoticeOutput["direction"]): NoticeOutput["direction"] {
  const out = outWords.test(text);
  const into = inWords.test(text);
  return out && !into ? "out" : into && !out ? "in" : model;
}

/** Whether the text states this date: with its year (or the ROC year), or as month and day. */
export function statesDate(text: string, iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return false;
  const md = `0?${mo}\\s*[/.\\-月]\\s*0?${d}(?!\\d)`;
  return new RegExp(`(?<!\\d)(?:(?:${y}|${y - 1911})\\s*[/.\\-年]\\s*)?${md}`).test(text);
}

/**
 * The fields to keep, or null when the notice isn't money in: money out (a
 * card charge, a transfer the person sent) or no amount found.
 */
export function checkNotice(out: NoticeOutput, text: string): NoticeFields | null {
  const plain = collapse(text);
  if (directionOf(plain, out.direction) === "out") return null;
  if (out.amount === null || !(out.amount > 0) || !numbersIn(plain).has(out.amount)) return null;
  const named = (out.currency ?? "").trim().toUpperCase();
  const code = currencyNames[named] ?? named;
  // A currency other than the default must be written in the notice.
  const currency = /^[A-Z]{3}$/.test(code) && (code === "TWD" || currencySigns[code]?.test(plain) || plain.toUpperCase().includes(code)) ? code : "TWD";
  const payer = out.payer ? collapse(out.payer) : "";
  return {
    amount: out.amount,
    currency,
    date: out.date && statesDate(plain, out.date) ? out.date : null,
    // A name the notice shows, never a number dressed as one.
    payer: payer && payer.length <= 80 && plain.includes(payer) && !/\d{5,}/.test(payer) ? payer : null,
    last4: out.last4 && /^\d{4}$/.test(out.last4) && new RegExp(`(?<!\\d)${out.last4}(?!\\d)`).test(plain) ? out.last4 : null,
  };
}
