import type { GrantListing } from "./types";
export function grantAvailability(g: Pick<GrantListing,"opensOn"|"closesOn"|"sourceStatus"> & {checkedAt?:string}, today: string): "open" | "upcoming" | "check" | "closed" {
  if (g.closesOn && g.closesOn < today) return "closed";
  if (g.checkedAt && Date.now()-Date.parse(g.checkedAt)>24*60*60*1000) return "check";
  if (g.sourceStatus === "forecasted" || (g.opensOn && g.opensOn > today)) return "upcoming";
  if (g.sourceStatus === "posted" && g.opensOn && g.opensOn <= today) return "open";
  return "check";
}
