import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGrantsGovEligibility, enrichGrantsGovEligibility } from "./grants-gov-eligibility";
import { assessEligibility } from "./eligibility";
import { listingHash } from "./domain";
import type { GrantListing } from "./types";
const now=new Date("2026-10-20T12:00:00Z");
const detail=(ids:string[])=>({errorcode:0,data:{id:123,synopsis:{applicantTypes:ids.map(id=>({id,description:`Category ${id}`}))}}});
const row:GrantListing={source:"grants_gov",externalId:"123",region:"US",title:"Individual arts grant",agency:"Agency",url:"https://www.grants.gov/search-results-detail/123",opensOn:null,closesOn:null,sourceStatus:"posted",summary:""};
test("official applicant codes, not titles or funding country, determine preliminary eligibility",()=>{
 const rule=parseGrantsGovEligibility(detail(["12"]),"123",now)!;
 assert.deepEqual(rule.applicantTypes,["nonprofit"]);assert.equal(rule.countries,null);
 assert.equal(assessEligibility(rule,{version:1,applicantType:"individual",country:"US"},"2026-10-20").status,"mismatch");
 const individual=parseGrantsGovEligibility(detail(["21"]),"123",now)!;
 assert.equal(assessEligibility(individual,{version:1,applicantType:"individual",country:"TW"},"2026-10-20").status,"match");
});
test("ambiguous, other, missing, mismatched or qualified categories never exclude an applicant",()=>{
 for(const ids of [["25"],["12","25"],["unknown"]]) { const rule=parseGrantsGovEligibility(detail(ids),"123",now)!; assert.equal(rule.applicantTypes,null); assert.equal(assessEligibility(rule,{version:1,applicantType:"individual",country:"TW"},"2026-10-20").status,"check"); }
 assert.equal(parseGrantsGovEligibility(detail([]),"123",now),null);
 assert.equal(parseGrantsGovEligibility(detail(["12"]),"456",now),null);
 assert.equal(parseGrantsGovEligibility({errorcode:0,data:{id:123}},"123",now),null);
 const qualified={...detail(["12"]),data:{id:123,synopsis:{...detail(["12"]).data.synopsis,applicantEligibilityDesc:"Some individuals may also apply"}}};
 assert.equal(parseGrantsGovEligibility(qualified,"123",now)!.applicantTypes,null);
 assert.match(parseGrantsGovEligibility(qualified,"123",now)!.notes.en,/Some individuals may also apply/);
});
test("date refresh alone does not generate a new opportunity notice",()=>{
 const eligibility=parseGrantsGovEligibility(detail(["21"]),"123",now)!;
 assert.equal(listingHash({...row,eligibility}),listingHash({...row,eligibility:{...eligibility,verifiedOn:"2026-10-21",validThrough:"2026-10-22"}}));
});
test("detail request cap and failure preserve every original discovery record",async()=>{
 let calls=0;
 const rows=Array.from({length:35},()=>row);
 const enriched=await enrichGrantsGovEligibility(rows,async()=>{calls++;if(calls===1)throw new Error("source down");return detail(["21"]);},now);
 assert.equal(calls,30);assert.equal(enriched.length,35);assert.equal(enriched[0].eligibility,null);assert.equal(enriched[1].eligibility?.applicantTypes?.[0],"individual");assert.equal(enriched[34].eligibility,undefined);
});

test("official category ordering does not issue a false content-change notification",()=>{
 const a=parseGrantsGovEligibility(detail(["12","21","00"]),"123",now);
 const b=parseGrantsGovEligibility(detail(["00","12","21"]),"123",now);
 assert.deepEqual(a,b);assert.equal(listingHash({...row,eligibility:a}),listingHash({...row,eligibility:b}));
});
