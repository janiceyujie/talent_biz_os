// Reply-template placeholders. Templates are stored with language-neutral
// keys ({{counterparty}}); people read and type them in their own language
// (e.g. the Chinese word for "partner" in braces), and either spelling is accepted when typed.
//
// The per-language names live here, not in the message catalogs: they're part
// of how saved templates are read, so rewording a translation must never stop
// an old template from matching. Adding a language means adding its names here.
import { money } from "@/lib/domain/money";
import type { Locale } from "@/lib/i18n/config";

export const placeholderKeys = [
  "counterparty",
  "artist",
  "project",
  "offer",
  "quote",
  "deliverables",
  "rights",
  "next_due",
] as const;
export type PlaceholderKey = (typeof placeholderKeys)[number];

const names: Record<Locale, Record<PlaceholderKey, string>> = {
  en: {
    counterparty: "counterparty",
    artist: "artist",
    project: "project",
    offer: "offer",
    quote: "quote",
    deliverables: "deliverables",
    rights: "rights",
    next_due: "next_due",
  },
  "zh-TW": {
    counterparty: "合作方",
    artist: "藝人",
    project: "案件名稱",
    offer: "邀約內容",
    quote: "報價",
    deliverables: "交付內容",
    rights: "授權範圍",
    next_due: "下一步期限",
  },
};

// Every spelling in every language → its key.
const byName = new Map<string, PlaceholderKey>(
  Object.values(names).flatMap((table) => placeholderKeys.map((key) => [table[key], key] as const)),
);
const token = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** For storage: any known spelling becomes its neutral key; unknown names are left as typed. */
export const toStored = (body: string) =>
  body.replace(token, (whole, name: string) => {
    const key = byName.get(name);
    return key ? `{{${key}}}` : whole;
  });

/** For reading and editing: neutral keys shown in the given language. */
export const toDisplay = (body: string, locale: Locale) =>
  body.replace(token, (whole, name: string) => {
    const key = byName.get(name);
    return key ? `{{${names[locale][key]}}}` : whole;
  });

/** How one placeholder reads in a language, e.g. "{{counterparty}}" in English. */
export const placeholderName = (key: PlaceholderKey, locale: Locale) => `{{${names[locale][key]}}}`;

/** Wording that goes into a rendered reply follows the template's language, not the UI's. */
export const contentWords: Record<
  Locale,
  { quote: (amount: number, taxRate: number) => string; missing: (name: string) => string; listSeparator: string }
> = {
  en: {
    quote: (amount, taxRate) => `${money(amount, "en")} (incl. tax, ${taxRate}%)`,
    missing: (name) => `[to confirm: ${name}]`,
    listSeparator: ", ",
  },
  "zh-TW": {
    quote: (amount, taxRate) => `${money(amount, "zh-TW")}（含稅，稅率 ${taxRate}%）`,
    missing: (name) => `【待確認：${name}】`,
    listSeparator: "、",
  },
};

/** Resolve a placeholder name in any language to its key, if it's one we fill. */
export const placeholderKey = (name: string) => byName.get(name);
export const displayName = (key: PlaceholderKey, locale: Locale) => names[locale][key];
