/** Persisted opportunity evidence contract, shared by the grant schema and discovery extension. */
export type EligibilityRule = {
  version: 1;
  applicantTypes: ("individual" | "business" | "nonprofit" | "government" | "tribal" | "other")[] | null;
  countries: ("TW" | "US" | "other")[] | null;
  evidenceUrl: string;
  verifiedOn: string;
  validThrough: string;
  notes: { en: string; "zh-TW": string };
};
