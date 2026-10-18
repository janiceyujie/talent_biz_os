import {DEFAULT_MANAGED_ARTISTS, validArtistLimit} from "./limits";
export const MAX_MANAGED_ARTISTS = DEFAULT_MANAGED_ARTISTS;
export type ArtistAccess = {id:string;name:string;timeZone:string;role:string;status:string};
export class ManagerScopeError extends Error { constructor(public code:"forbidden"|"limit"|"invalid"|"plan") { super(code); } }
export const managedArtists = (rows:ArtistAccess[]) => rows.filter(row=>row.status==="active" && (row.role==="manager" || row.role==="agency_admin"));
/** A client filter is never proof of permission. Empty selection stays empty. */
export function selectManagedArtists(rows:ArtistAccess[], requested?:string[],limit=MAX_MANAGED_ARTISTS) {
  const permitted=managedArtists(rows);
  if(!validArtistLimit(limit)) throw new ManagerScopeError("plan");
  if(requested && (requested.length>100 || requested.some(id=>typeof id!=="string" || !id || id.length>100))) throw new ManagerScopeError("invalid");
  const ids=[...new Set(requested ?? permitted.map(row=>row.id))];
  if(permitted.length>limit||ids.length>limit) throw new ManagerScopeError("limit");
  if(ids.some(id=>!permitted.some(row=>row.id===id))) throw new ManagerScopeError("forbidden");
  return permitted.filter(row=>ids.includes(row.id));
}
export function managerDateRange(start:string,end:string) {
  const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if(!valid(start)||!valid(end)) throw new ManagerScopeError("invalid");
  const days=(Date.parse(end)-Date.parse(start))/86400000;
  if(days<0||days>92) throw new ManagerScopeError("invalid");
  return {start,end};
}
