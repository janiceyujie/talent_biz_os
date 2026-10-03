// Supported UI languages. Adding one: add its messages/<locale>.json and an
// entry here — no migration (person.locale is checked in code).
export const locales = ["zh-TW", "en"] as const;
export type Locale = (typeof locales)[number];

/** What new users get unless their browser asks for another supported language. */
export const defaultLocale: Locale = "zh-TW";

/** The reference catalog: defines the key set; missing keys fall back to it. */
export const referenceLocale: Locale = "en";

export const localeNames: Record<Locale, string> = { "zh-TW": "繁體中文", en: "English" };

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

/** A stored or requested value as a supported locale, or the default. */
export const toLocale = (value: unknown): Locale => (isLocale(value) ? value : defaultLocale);

/** Best supported match for an Accept-Language header, by quality order. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale | null {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag.startsWith("zh")) return "zh-TW"; // the one Chinese variant shipped
    if (tag.startsWith("en")) return "en";
  }
  return null;
}
