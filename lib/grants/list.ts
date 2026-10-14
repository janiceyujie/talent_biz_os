import { grantAvailability } from "./availability";
import { dateInZone } from "../domain/dates";
import type { GrantOpportunity } from "./types";

export type GrantAvailabilityFilter = "active" | "all" | "open" | "upcoming" | "check" | "closed";
const priority = { open: 0, upcoming: 1, check: 2, closed: 3 };

/** Discovery puts actionable opportunities first; saved applications keep past deadlines visible. */
export function filterGrantOpportunities(opportunities: GrantOpportunity[], options: {
  region: string; query: string; availability: GrantAvailabilityFilter; timeZone: string; savedIds?: string[];
}) {
  const query = options.query.normalize("NFKC").trim().toLocaleLowerCase();
  const saved = options.savedIds ? new Set(options.savedIds) : null;
  return opportunities.map(opportunity => ({opportunity, state: grantAvailability(opportunity, dateInZone(opportunity.region === "TW" ? "Asia/Taipei" : options.timeZone))}))
    .filter(({opportunity: g, state}) =>
      (options.region === "all" || options.region === g.region) &&
      (!saved || saved.has(g.id)) &&
      (options.availability === "all" || (options.availability === "active" ? state !== "closed" : state === options.availability)) &&
      `${g.title} ${g.agency}`.normalize("NFKC").toLocaleLowerCase().includes(query))
    .sort((a, b) => priority[a.state] - priority[b.state] ||
      (a.opportunity.closesOn || "9999").localeCompare(b.opportunity.closesOn || "9999") ||
      a.opportunity.title.localeCompare(b.opportunity.title))
    .map(({opportunity}) => opportunity);
}
