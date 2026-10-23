// Opportunities (decision 0024): public calls for grants, competitions, and
// showcases, kept in a catalogue shared by every account, and the talent's own
// applications to them. Pure, no server-only imports: the schema and the
// browser use these lists too.
import { z } from "zod";
import { areas, type Area } from "./areas";

export const opportunityKinds = ["grant", "competition", "showcase", "residency"] as const;
export type OpportunityKind = (typeof opportunityKinds)[number];

export const opportunityRegions = ["TW", "US"] as const;
export type OpportunityRegion = (typeof opportunityRegions)[number];

/** Where a call came from: the structured sources, read directly, and the tracked pages (lib/opportunities/tracked.ts). */
export const opportunitySources = ["moc", "grants_gov", "pages"] as const;
export type OpportunitySource = (typeof opportunitySources)[number];

/** What the source says of a call: open for applications, announced as coming, or not said. */
export const sourceStatuses = ["posted", "forecasted", "unknown"] as const;
export type SourceStatus = (typeof sourceStatuses)[number];

export const applicationStages = ["preparing", "submitted", "awarded", "not_selected", "closed"] as const;
export type ApplicationStage = (typeof applicationStages)[number];

export const taskKinds = ["submission", "eligibility", "proposal", "budget", "agreement", "report", "settlement", "custom"] as const;
export type TaskKind = (typeof taskKinds)[number];

// Who you are -----------------------------------------------------------------

export const applicantTypes = ["individual", "business", "nonprofit", "other"] as const;
export type ApplicantType = (typeof applicantTypes)[number];
export const countries = ["TW", "US", "other"] as const;
export type Country = (typeof countries)[number];
export const disciplines = ["music", "performing_arts", "visual_arts", "film", "writing", "content", "other"] as const;
export type Discipline = (typeof disciplines)[number];

/** The screening profile, per person and per talent (the `opportunities.profile` preference). */
export const screeningProfileSchema = z.object({
  version: z.literal(1),
  applicantType: z.enum(applicantTypes).nullable(),
  country: z.enum(countries).nullable(),
  area: z.enum(areas).nullable(), // county or city in Taiwan, state in the US
  disciplines: z.array(z.enum(disciplines)).max(disciplines.length),
});
export type ScreeningProfile = z.infer<typeof screeningProfileSchema>;
export const emptyProfile: ScreeningProfile = { version: 1, applicantType: null, country: null, area: null, disciplines: [] };

// A call's rules --------------------------------------------------------------

/**
 * Who a call is for, one dimension at a time: the values it's limited to,
 * "any" when the source says it isn't limited, or null when the source
 * doesn't say. Only an official code or a checked passage sets one; nothing is
 * guessed from a title. Government is a rule value, not a profile one: some
 * forms are for county governments, and no talent is one.
 */
const dimension = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.literal("any"), z.array(z.enum(values)).min(1)]).nullable();
export const ruleApplicantTypes = [...applicantTypes, "government"] as const;
export const opportunityRulesSchema = z.object({
  applicantTypes: dimension(ruleApplicantTypes),
  countries: dimension(countries),
  areas: dimension(areas),
  disciplines: dimension(disciplines),
  evidence: z.string().max(2000), // the official words the rules were read from
});
export type OpportunityRules = z.infer<typeof opportunityRulesSchema>;

// What the app works with -----------------------------------------------------

export type Opportunity = {
  id: string;
  source: OpportunitySource;
  region: OpportunityRegion;
  kind: OpportunityKind;
  title: string;
  agency: string;
  url: string;
  opensOn: string | null;
  closesOn: string | null;
  sourceStatus: SourceStatus;
  summary: string;
  rules: OpportunityRules | null;
  /** A tracked page's call: the passage each checked field was read from. */
  passages?: Record<string, string> | null;
  checkedAt: string;
  changedAt: string;
};

export type ApplicationTask = {
  id: string; // the to-do's
  kind: TaskKind;
  title: string;
  date: string | null;
  time: string;
  timeZone: string;
  status: "open" | "done" | "dismissed";
};

export type Application = {
  id: string;
  opportunityId: string;
  stage: ApplicationStage;
  projectId: string | null;
  notes: string;
  tasks: ApplicationTask[];
};

/** A followed call whose dates at the source aren't the ones the talent last saw (decision 0024): a notification until they act on it. */
export type OpportunityChange = {
  applicationId: string;
  title: string;
  from: { opensOn: string | null; closesOn: string | null };
  to: { opensOn: string | null; closesOn: string | null };
  zone: string; // the source's: a closing date is that day there
  submit: { todoId: string; date: string | null } | null; // the open Submit to-do, which the person can move
};

export type OpportunitiesWorkspace = {
  /** The calls this talent follows, whatever their state: the list pages only through the rest. */
  followed: Opportunity[];
  applications: Application[];
  sources: { id: OpportunitySource; checkedAt: string | null }[];
};

export type { Area };
