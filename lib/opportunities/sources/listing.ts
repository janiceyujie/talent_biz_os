import { createHash } from "node:crypto";
import { z } from "zod";
import type { Opportunity } from "../types";

/** A call as a source gives it: what the catalogue stores, before it has an id or check times. */
export type Listing = Omit<Opportunity, "id" | "checkedAt" | "changedAt"> & { externalId: string };

export function isoDate(year: number, month: number, day: number): string | null {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return z.iso.date().safeParse(value).success ? value : null;
}

export const plain = (s: string) => s.replace(/\s+/g, " ").trim();

/** What changes when a call changes: its facts and rules, not the time it was read. */
export const listingHash = (l: Listing) => createHash("sha256").update(JSON.stringify(l)).digest("hex");

export const stableId = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
