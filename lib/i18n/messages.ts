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

const load = async (locale: Locale): Promise<Tree> => (await import(`../../messages/${locale}.json`)).default;

/** A locale's catalog over the reference catalog, so a missing key reads in English, not as a key. */
export async function loadMessages(locale: Locale) {
  const reference = await load(referenceLocale);
  return locale === referenceLocale ? reference : merge(reference, await load(locale));
}
