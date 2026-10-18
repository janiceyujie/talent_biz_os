import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTax, taxContextInput, type TaxContext, type RuleEvidence, type RateEvidence } from "./domain";
const today = "2026-10-17";
const context: TaxContext = { state:"CA",sellerState:"CA",saleOn:today,category:"photography",delivery:"physical",collection:"registered",exemption:"none",location:"Example address, California",jurisdictionId:"00000000-0000-4000-8000-000000000001",jurisdictionConfirmed:true,standardSaleConfirmed:true };
const rule:RuleEvidence={id:"r",state:"CA",category:"photography",delivery:"physical",treatment:"taxable",status:"reviewed",validFrom:today,validThrough:"2026-11-16",sourceUrl:"https://cdtfa.ca.gov/industry/photography/industry-topics.htm",contentHash:"rule-hash"};
const rate:RateEvidence={id:context.jurisdictionId!,state:"CA",kind:"combined",rate:10.25,validFrom:"2026-10-01",validThrough:null,sourceUrl:"https://cdtfa.ca.gov/taxes-and-fees/rates.xlsx",batchHash:"batch-hash",checkedAt:today,name:"Example city"};
test("only a reviewed matching rule plus combined rate can produce taxable result",()=>{
 const result=resolveTax(context,[rule],rate,today);assert.equal(result.status,"ready");
 if(result.status==="ready"){assert.equal(result.rate,10.25);assert.equal(result.batchHash,"batch-hash");assert.equal(result.ruleHash,"rule-hash");}
});
test("public component rows, other jurisdictions, missing rows and invalid rates never become totals",()=>{
 for(const altered of [undefined,{...rate,kind:"component"},{...rate,state:"NY"},{...rate,id:"other"},{...rate,rate:NaN},{...rate,rate:-1}])assert.equal(resolveTax(context,[rule],altered,today).status,"review");
});
test("unsupported services do not inherit a state rate or zero",()=>{
 for(const category of ["livePerformance","influencerSponsorship","videoProduction","musicLicensing","merchandise"] as const)assert.equal(resolveTax({...context,category},[rule],rate,today).status,"review");
 assert.equal(resolveTax(context,[],rate,today).status,"review");
 assert.equal(resolveTax(context,[{...rule,status:"pending"}],rate,today).status,"review");
 assert.equal(resolveTax(context,[rule,rule],rate,today).status,"review");
});
test("cross-state, exemptions, unknown collection, and missing facts fail closed",()=>{
 for(const patch of [{sellerState:"NY"},{exemption:"claimed"},{collection:"unknown"},{collection:"notRequired"},{jurisdictionConfirmed:false},{standardSaleConfirmed:false},{category:"mixed"},{delivery:"mixed"}] as Partial<TaxContext>[])assert.equal(resolveTax({...context,...patch},[rule],rate,today).status,"review");
});
test("sale date, review expiry, and stale data are separate gates",()=>{
 assert.equal(resolveTax({...context,saleOn:"2026-10-16"},[rule],rate,today).status,"review");
 assert.equal(resolveTax(context,[rule],rate,"2026-11-17").status,"review");
 assert.equal(resolveTax(context,[rule],{...rate,checkedAt:"2026-09-01"},today).status,"review");
 assert.equal(resolveTax(context,[rule],{...rate,validFrom:"2026-11-01"},today).status,"review");
 assert.equal(resolveTax(context,[rule],{...rate,validThrough:"2026-10-16"},today).status,"review");
});
test("electronic-only photography exemption is scoped and needs no arbitrary rate row",()=>{
 const result=resolveTax({...context,delivery:"electronic"},[{...rule,delivery:"electronic",treatment:"nonTaxable"}],undefined,today);
 assert.equal(result.status,"ready");if(result.status==="ready"){assert.equal(result.rate,0);assert.equal(result.treatment,"nonTaxable");assert.equal(result.rateId,undefined);}
 assert.equal(resolveTax(context,[{...rule,delivery:"electronic",treatment:"nonTaxable"}],undefined,today).status,"review");
});
test("invalid dates, unknown categories and injected fields cannot enter tax context",()=>{
 assert.equal(taxContextInput.safeParse(context).success,true);
 for(const patch of [{saleOn:"2026-02-30"},{category:"anything"},{jurisdictionId:"not-a-uuid"},{rate:0},{location:""}])assert.equal(taxContextInput.safeParse({...context,...patch}).success,false);
});
