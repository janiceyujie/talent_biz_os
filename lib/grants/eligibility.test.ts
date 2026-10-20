import assert from "node:assert/strict";
import { test } from "node:test";
import { assessEligibility, eligibilityProfileSchema, type EligibilityProfile } from "./eligibility";
import { reviewedCatalogue } from "./reviewed-catalogue";
import { GRANT_REFRESH_CRON, reuseGrantRefresh } from "./refresh-policy";
const nea=reviewedCatalogue.find(r=>r.externalId==="nea-gap-2026-july")!.eligibility;
const individual:EligibilityProfile={version:1,applicantType:"individual",country:"TW"};
test("explicit restrictions explain a mismatch; a host country is never an applicant restriction",()=>{
  assert.deepEqual(assessEligibility(nea,individual,"2026-10-20"),{status:"mismatch",reasons:["applicantType","country"]});
  assert.equal(assessEligibility(reviewedCatalogue.find(r=>r.externalId==="isc-2026")!.eligibility,individual,"2026-10-20").status,"match");
});
test("unknown, incomplete, future and expired evidence never excludes applicants",()=>{
  for(const rule of [null,{}, {...nea,verifiedOn:"2027-01-01"}, {...nea,validThrough:"2026-10-19"}]) assert.equal(assessEligibility(rule,individual,"2026-10-20").status,"check");
  assert.equal(assessEligibility(nea,null,"2026-10-20").status,"check");
  assert.equal(assessEligibility(nea,{...individual,applicantType:"nonprofit",country:null},"2026-10-20").status,"check");
});
test("known match is preliminary; malformed profiles cannot be saved",()=>{
  assert.equal(assessEligibility(nea,{...individual,applicantType:"nonprofit",country:"US"},"2026-10-20").status,"match");
  assert.equal(eligibilityProfileSchema.safeParse({...individual,applicantType:"artist"}).success,false);
});
test("daily cron and manual bypass with concurrent coalescing",()=>{
  assert.equal(GRANT_REFRESH_CRON,"0 0 * * *");
  const now=new Date("2026-10-20T12:00:00Z"),before=new Date(now.getTime()-1000),after=new Date(now.getTime()+1000);
  assert.equal(reuseGrantRefresh(before,now,true),false);
  assert.equal(reuseGrantRefresh(before,now,false),true);
  assert.equal(reuseGrantRefresh(after,now,true),true);
  assert.equal(reuseGrantRefresh(null,now,true),false);
  assert.equal(reuseGrantRefresh(new Date(now.getTime()-86400000),now,false),false);
});
