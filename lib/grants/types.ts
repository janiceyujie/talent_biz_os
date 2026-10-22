import type { OpportunityDiscipline } from "./disciplines";
import type { EligibilityRule } from "./eligibility";
export const opportunityKinds = ["grant", "competition", "exhibition", "showcase"] as const;
export type OpportunityKind = (typeof opportunityKinds)[number];
export const grantRegions = ["TW", "US"] as const;
export type GrantRegion = (typeof grantRegions)[number];
export const grantSources = ["moc", "grants_gov", "streetvoice", "cycc", "kingcar", "gma", "goldenhorse", "kff", "tfda", "taipeiff", "skm", "kmfa_award"] as const;
export type GrantSource = (typeof grantSources)[number] | "reviewed";
export const grantStages = ["preparing", "submitted", "awarded", "not_selected", "closed"] as const;
export type GrantStage = (typeof grantStages)[number];
export const grantTaskKinds = ["eligibility", "proposal", "budget", "submission", "agreement", "receipts", "report", "settlement", "custom"] as const;
export type GrantTaskKind = (typeof grantTaskKinds)[number];
export type GrantListing = {
  source: GrantSource; externalId: string; region: GrantRegion; title: string; agency: string;
  url: string; opensOn: string | null; closesOn: string | null;
  sourceStatus: "posted" | "forecasted" | "unknown";
  summary: string; disciplines?: OpportunityDiscipline[]; kind?: OpportunityKind; eligibility?: EligibilityRule | null;
};
export type GrantOpportunity = GrantListing & {noticeRevision?:number;id: string; checkedAt: string; changedAt: string; kind?: OpportunityKind; eligibility?: EligibilityRule | null};
export type GrantApplication = {
  id: string; opportunityId: string; stage: GrantStage; projectId: string | null; notes: string;
  tasks: {id: string; kind: GrantTaskKind; title: string; date: string | null; time: string; timeZone: string; status: "open" | "done" | "dismissed"}[];
};
export type GrantWorkspace = {
  opportunities: GrantOpportunity[]; applications: GrantApplication[];
  sources: {id: GrantSource; checkedAt: string | null; failed: boolean}[];
  watch: {enabled: boolean; regions: GrantRegion[]};
};
