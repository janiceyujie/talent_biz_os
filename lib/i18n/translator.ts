import type { Locale } from "./config";
import { loadMessages } from "./messages";

/**
 * Translations in an explicit locale, without a request: next-intl's
 * getTranslations needs Next's request setup, and its React-based helpers
 * don't load in the worker. Same catalogs and English fallback as the app
 * (lib/i18n/messages.ts), for strings with plain {name} placeholders only: a
 * plural or select would be formatted wrong here, so it throws instead.
 */
export async function translator(locale: Locale, namespace: string) {
  const messages = (await loadMessages(locale)) as Record<string, unknown>;
  const group = (messages[namespace] ?? {}) as Record<string, unknown>;
  return (key: string, values: Record<string, string | number> = {}) => {
    const text = group[key];
    if (typeof text !== "string") return `${namespace}.${key}`; // the app's own fallback for a missing key
    if (/\{\s*\w+\s*,/.test(text)) throw new Error(`${namespace}.${key} uses plural or select, which translator() doesn't format`);
    return text.replace(/\{\s*(\w+)\s*\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
  };
}
