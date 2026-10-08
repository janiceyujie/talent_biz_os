// Organisations that may be the same one entered twice (decision 0012): pure
// rules over names and the people's email domains, offered as suggestions for
// a person to merge or dismiss — never merged on their own.
import type { Contact, Organization } from "@/lib/types";

// Endings that say what kind of company it is, not which one; longest first, so a long Chinese suffix is removed whole rather than just its shorter ending.
const legalSuffixes = [
  "股份有限公司",
  "有限公司",
  "工作室",
  "公司",
  "incorporated",
  "corporation",
  "company",
  "limited",
  "inc",
  "ltd",
  "llc",
  "corp",
  "co",
];

/** A name reduced to what tells organisations apart: same width, case, and spacing; no punctuation or legal suffix. */
export function normalizeOrgName(name: string) {
  let n = name.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const suffix of legalSuffixes) {
      const cut = n.endsWith(` ${suffix}`) ? n.length - suffix.length - 1 : /\p{Script=Han}$/u.test(suffix) && n.endsWith(suffix) ? n.length - suffix.length : -1;
      if (cut > 0) {
        n = n.slice(0, cut).trim();
        changed = true;
      }
    }
  }
  return n.replace(/\s/g, "");
}

// Free email providers: sharing one says nothing about working at the same place.
const freeMail = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.tw",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pchome.com.tw",
  "hinet.net",
  "msa.hinet.net",
]);

const domainOf = (email: string) => {
  const d = email.trim().toLowerCase().split("@")[1];
  return d && !freeMail.has(d) ? d : null;
};

/** Edits (insert, delete, change one letter) between two short strings. */
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

export type DuplicateReason = "sameName" | "sharedDomain" | "contains" | "spelling";
export type DuplicateSuggestion = { a: Organization; b: Organization; strong: boolean; reason: DuplicateReason; domain?: string };

const MIN_CONTAINED = 3; // characters; shorter names inside longer ones match too much
// "Studio 1" and "Studio 10" are usually two places, not one typed twice: names that differ only in their digits.
const onlyDigitsApart = (x: string, y: string) => x !== y && x.replace(/\d+/g, "") === y.replace(/\d+/g, "");
const LATIN = /^[a-z0-9]+$/;

/** The key for a pair, whichever way round: smaller id first. */
export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Pairs of the talent's live organisations that may be one and the same, the
 * strong ones first. `distinct` holds the pairs someone said are different
 * (pairKey), which are never suggested again.
 */
export function duplicateSuggestions(organizations: Organization[], contacts: Contact[], distinct: Set<string>): DuplicateSuggestion[] {
  const live = organizations.filter((o) => !o.archived);
  const norm = new Map(live.map((o) => [o.id, normalizeOrgName(o.name)]));
  const domains = new Map(
    live.map((o) => [o.id, new Set(contacts.filter((c) => c.organizationId === o.id).flatMap((c) => domainOf(c.email) ?? []))]),
  );
  const out: DuplicateSuggestion[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const [a, b] = [live[i], live[j]];
      if (distinct.has(pairKey(a.id, b.id))) continue;
      const [na, nb] = [norm.get(a.id)!, norm.get(b.id)!];
      if (!na || !nb) continue;
      const shared = [...domains.get(a.id)!].find((d) => domains.get(b.id)!.has(d));
      if (na === nb) out.push({ a, b, strong: true, reason: "sameName" });
      else if (shared) out.push({ a, b, strong: true, reason: "sharedDomain", domain: shared });
      else if (onlyDigitsApart(na, nb)) continue;
      else if (Math.min(na.length, nb.length) >= MIN_CONTAINED && (na.includes(nb) || nb.includes(na)))
        out.push({ a, b, strong: false, reason: "contains" });
      else if (LATIN.test(na) && LATIN.test(nb) && Math.min(na.length, nb.length) >= 5 && editDistance(na, nb) <= (Math.max(na.length, nb.length) >= 10 ? 2 : 1))
        out.push({ a, b, strong: false, reason: "spelling" });
    }
  }
  return out.sort((x, y) => Number(y.strong) - Number(x.strong));
}
