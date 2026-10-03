// IANA time zones for pickers and checks. Zone names are stored as-is
// (e.g. "Asia/Tokyo"); city names are display help, in both languages.
import type { Locale } from "@/lib/i18n/config";

const cities: Record<string, Record<Locale, string>> = {
  "Asia/Taipei": { "zh-TW": "台北", en: "Taipei" },
  "Asia/Tokyo": { "zh-TW": "東京", en: "Tokyo" },
  "Asia/Seoul": { "zh-TW": "首爾", en: "Seoul" },
  "Asia/Hong_Kong": { "zh-TW": "香港", en: "Hong Kong" },
  "Asia/Macau": { "zh-TW": "澳門", en: "Macau" },
  "Asia/Shanghai": { "zh-TW": "上海・北京", en: "Shanghai / Beijing" },
  "Asia/Singapore": { "zh-TW": "新加坡", en: "Singapore" },
  "Asia/Kuala_Lumpur": { "zh-TW": "吉隆坡", en: "Kuala Lumpur" },
  "Asia/Bangkok": { "zh-TW": "曼谷", en: "Bangkok" },
  "Asia/Manila": { "zh-TW": "馬尼拉", en: "Manila" },
  "Asia/Jakarta": { "zh-TW": "雅加達", en: "Jakarta" },
  "Asia/Ho_Chi_Minh": { "zh-TW": "胡志明市", en: "Ho Chi Minh City" },
  "Asia/Kolkata": { "zh-TW": "印度", en: "India" },
  "Asia/Dubai": { "zh-TW": "杜拜", en: "Dubai" },
  "Australia/Sydney": { "zh-TW": "雪梨", en: "Sydney" },
  "Australia/Melbourne": { "zh-TW": "墨爾本", en: "Melbourne" },
  "Pacific/Auckland": { "zh-TW": "奧克蘭", en: "Auckland" },
  "Europe/London": { "zh-TW": "倫敦", en: "London" },
  "Europe/Paris": { "zh-TW": "巴黎", en: "Paris" },
  "Europe/Berlin": { "zh-TW": "柏林", en: "Berlin" },
  "Europe/Amsterdam": { "zh-TW": "阿姆斯特丹", en: "Amsterdam" },
  "America/New_York": { "zh-TW": "紐約", en: "New York" },
  "America/Chicago": { "zh-TW": "芝加哥", en: "Chicago" },
  "America/Denver": { "zh-TW": "丹佛", en: "Denver" },
  "America/Los_Angeles": { "zh-TW": "洛杉磯", en: "Los Angeles" },
  "America/Vancouver": { "zh-TW": "溫哥華", en: "Vancouver" },
  "America/Toronto": { "zh-TW": "多倫多", en: "Toronto" },
  "America/Sao_Paulo": { "zh-TW": "聖保羅", en: "São Paulo" },
  UTC: { "zh-TW": "世界協調時間", en: "Coordinated Universal Time" },
};

/** The zone's canonical name, or null if it isn't a zone this runtime knows. Accepts any letter case. */
export function canonicalZone(value: string): string | null {
  if (!value.trim()) return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
export const isTimeZone = (value: string) => canonicalZone(value) !== null;

/** "UTC+9", "UTC−3:30", "UTC" — the offset at `at` (daylight saving changes it). */
export function utcOffset(zone: string, at = new Date()) {
  const name = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return !name || name === "GMT" ? "UTC" : name.replace("GMT", "UTC").replace("-", "−");
}

export type ZoneOption = { zone: string; city: string; offset: string; search: string };

/** Every zone, listed cities first; `search` matches city names in both languages, the zone, and the offset. */
export function zoneOptions(locale: Locale, at = new Date()): ZoneOption[] {
  const all = [...new Set([...Object.keys(cities), ...Intl.supportedValuesOf("timeZone")])];
  return all.map((zone) => {
    const offset = utcOffset(zone, at);
    const names = cities[zone];
    return {
      zone,
      city: names?.[locale] ?? "",
      offset,
      search: [zone, zone.replaceAll("_", " "), names?.["zh-TW"], names?.en, offset].filter(Boolean).join(" ").toLowerCase(),
    };
  });
}
