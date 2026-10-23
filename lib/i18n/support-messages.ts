import type { Locale } from "./config";

// The Support page's own catalog (messages/support/), apart from the app's: the
// app's catalog reaches every person's browser, and the staff tool's wording
// needn't. Only the Support page loads it. npm run i18n:check keeps its
// languages in step, as it does the app's.

const catalogs = {
  en: () => import("../../messages/support/en.json"),
  "zh-TW": () => import("../../messages/support/zh-TW.json"),
} satisfies Record<Locale, unknown>;

export const loadSupportMessages = async (locale: Locale) => (await catalogs[locale]()).default;

/** The Support page's translator, for its server components. */
export async function supportTranslator(locale: Locale) {
  const { createTranslator } = await import("next-intl");
  return createTranslator({ locale, messages: await loadSupportMessages(locale), namespace: "support" });
}
