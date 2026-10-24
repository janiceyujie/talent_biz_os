import { createHash } from "node:crypto";
import { z } from "zod";
import type { Opportunity } from "../types";

/** A call as a source gives it: what the catalogue stores, before it has an id or check times. */
export type Listing = Omit<Opportunity, "id" | "checkedAt" | "changedAt"> & { externalId: string };

export function isoDate(year: number, month: number, day: number): string | null {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return z.iso.date().safeParse(value).success ? value : null;
}

/**
 * A call with no closing date that opened over a year ago (`today` a day in its funding body's
 * zone): an earlier round still listed, not an open call. A program open all year has a fresh round.
 */
export function oldRound(call: { opensOn: string | null; closesOn: string | null }, today: string) {
  const yearAgo = new Date(`${today}T12:00:00Z`);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 365);
  return !call.closesOn && !!call.opensOn && call.opensOn < yearAgo.toISOString().slice(0, 10);
}

export const plain = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * What changes when a call changes: its facts and rules, not the time it was read.
 * Keys in a fixed order, so rules kept from the catalogue (jsonb reorders them) hash as when they were read.
 */
export const listingHash = (l: Listing) =>
  createHash("sha256")
    .update(JSON.stringify(l, (_, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).toSorted(([a], [b]) => (a < b ? -1 : 1))) : v)))
    .digest("hex");

export const stableId = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
