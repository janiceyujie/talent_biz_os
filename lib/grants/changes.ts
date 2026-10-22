import type { GrantListing } from "./types";
export type OpportunityChange = {id:string;opportunityId:string;kind:"new"|"dates";oldOpensOn:string|null;newOpensOn:string|null;oldClosesOn:string|null;newClosesOn:string|null;createdAt:string};
/** Fetch timestamps, editorial text, tags and source migrations are not notification events. */
export function opportunityChange(before:Pick<GrantListing,"opensOn"|"closesOn">|undefined,after:Pick<GrantListing,"opensOn"|"closesOn">){
 if(before&&before.opensOn===after.opensOn&&before.closesOn===after.closesOn)return null;
 return {kind:before?"dates" as const:"new" as const,oldOpensOn:before?.opensOn??null,newOpensOn:after.opensOn,oldClosesOn:before?.closesOn??null,newClosesOn:after.closesOn};
}
