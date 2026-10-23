// The beta list's rules that need no database (decision 0028): reading a pasted
// batch, sorting it before anything is added, and each place's status. The
// reads and writes are in ./beta-list.ts.

import { listEmail } from "@/lib/auth/beta-access";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;

/** A name, as far as a pasted line gives one: trimmed, its spaces collapsed, at most 100 characters. */
const cleanName = (raw: string) => raw.replace(/[\p{C}"']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100) || null;

/**
 * The people in what was pasted, one a line: an address, and the first other
 * field on its line as their name ("Mei Lin <mei@example.com>", "mei@example.com,
 * Mei Lin", two columns copied from a spreadsheet, or a row of the waitlist's CSV
 * export). A line with several addresses is a list of addresses, without names.
 * Addresses are lowercased and trimmed as the list stores them, each once.
 * Anything with an @ that isn't an address comes back as invalid; lines without
 * one (the CSV's header) are passed over.
 */
export function parseBatch(pasted: string) {
  const people = new Map<string, string | null>();
  const invalid = new Set<string>();
  for (const line of pasted.split(/\r?\n/)) {
    const tokens = line.split(/[\s,;<>"'()]+/).filter((t) => t.includes("@"));
    const emails = tokens.map(listEmail).filter((e) => EMAIL.test(e));
    for (const t of tokens) if (!EMAIL.test(listEmail(t))) invalid.add(listEmail(t));
    if (emails.length !== 1) {
      for (const e of emails) if (!people.has(e)) people.set(e, null);
      continue;
    }
    // The line without its address: "Mei Lin <>" or ", Mei Lin, musician" leave the name first.
    const rest = line.replace(/<?\s*[^\s,;<>"'()]*@[^\s,;<>"'()]*\s*>?/, "\t");
    const name = rest
      .split(/[\t,;]+/)
      .map(cleanName)
      .find(Boolean);
    if (!people.get(emails[0])) people.set(emails[0], name ?? null);
  }
  return { people: [...people].map(([email, name]) => ({ email, name })), invalid: [...invalid] };
}

export type ListedPlace = { email: string; withdrawnAt: Date | null };

/**
 * A batch sorted before it's added: new places, withdrawn ones to restore, and
 * those passed over because they're on the list already or have an account.
 */
export function sortBatch(emails: string[], listed: ListedPlace[], accounts: string[]) {
  const onList = new Map(listed.map((p) => [p.email, p]));
  const withAccount = new Set(accounts);
  const batch = { add: [] as string[], restore: [] as string[], listed: [] as string[], hasAccount: [] as string[] };
  for (const email of emails) {
    const place = onList.get(email);
    if (withAccount.has(email)) batch.hasAccount.push(email);
    else if (!place) batch.add.push(email);
    else if (place.withdrawnAt) batch.restore.push(email);
    else batch.listed.push(email);
  }
  return batch;
}

export const placeStatuses = ["added", "invited", "signedUp", "withdrawn"] as const;
export type PlaceStatus = (typeof placeStatuses)[number];

/** Where one place stands: added, invited (an email sent), signed up, or withdrawn. */
export function statusOf(p: { usedAt: Date | null; withdrawnAt: Date | null; invitationSentAt: Date | null }): PlaceStatus {
  if (p.withdrawnAt) return "withdrawn";
  if (p.usedAt) return "signedUp";
  return p.invitationSentAt ? "invited" : "added";
}

/** Who may still be sent an invitation: anyone on the list who hasn't signed up. */
export const canInvite = (p: { usedAt: Date | null; withdrawnAt: Date | null }) => !p.usedAt && !p.withdrawnAt;
