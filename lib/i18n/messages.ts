import type { Locale } from "./config";
import { referenceLocale } from "./config";

type Tree = { [key: string]: string | Tree };

function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? merge(b, v) : v;
  }
  return out;
}

// Each catalog by name: an import built from a template would make the bundler
// pack every JSON file it could match, the Support page's own catalog among them
// (messages/support/), into chunks any browser can fetch.
const catalogs: Record<Locale, () => Promise<{ default: Tree }>> = {
  en: () => import("../../messages/en.json"),
  "zh-TW": () => import("../../messages/zh-TW.json"),
};

const load = async (locale: Locale): Promise<Tree> => (await catalogs[locale]()).default;

/** A locale's catalog over the reference catalog, so a missing key reads in English, not as a key. */
export async function loadMessages(locale: Locale) {
  const reference = await load(referenceLocale);
  return locale === referenceLocale ? reference : merge(reference, await load(locale));
}
