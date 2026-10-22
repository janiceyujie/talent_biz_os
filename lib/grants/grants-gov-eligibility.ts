import { z } from "zod";
import type { EligibilityRule } from "./eligibility";
import type { GrantListing } from "./types";
import { grantPlainText } from "./domain";

// Broad profile groups are only a preliminary screen; exact official subtypes remain in the notes.
const types:Record<string,NonNullable<EligibilityRule["applicantTypes"]>>={
  "00":["government"],"01":["government"],"02":["government"],"04":["government"],
  "05":["government"],"06":["government","nonprofit"],"07":["tribal"],
  "12":["nonprofit"],"13":["nonprofit"],"21":["individual"],"22":["business"],"23":["business"],
  "99":["individual","business","nonprofit","government","tribal","other"],
};
const detailSchema=z.object({errorcode:z.literal(0),data:z.object({id:z.union([z.string(),z.number()]),synopsis:z.object({
  applicantTypes:z.array(z.object({id:z.string(),description:z.string().max(1000)})).min(1).max(50),
  applicantEligibilityDesc:z.string().max(20000).nullish(),
}).nullish()})});
export function parseGrantsGovEligibility(value:unknown,externalId:string,now:Date):EligibilityRule|null {
  const parsed=detailSchema.safeParse(value);
  if(!parsed.success || String(parsed.data.data.id)!==externalId || !parsed.data.data.synopsis) return null;
  const synopsis=parsed.data.data.synopsis;
  const categories=[...synopsis.applicantTypes].sort((a,b)=>a.id.localeCompare(b.id)||a.description.localeCompare(b.description));
  // 'Other', unknown codes, ambiguous institution types or extra eligibility prose require human review.
  // Never infer eligibility by keywords in a grant title or infer residency from its source country.
  const additional=grantPlainText(synopsis.applicantEligibilityDesc??"");
  const ambiguous=categories.some(t=>!types[t.id]) || !!additional;
  const labels=categories.map(t=>grantPlainText(t.description)).join("; ").slice(0,700);
  const excerpt=additional?` ${additional.slice(0,900)}`:"";
  return {version:1,applicantTypes:ambiguous?null:[...new Set(categories.flatMap(t=>types[t.id]))],countries:null,
    evidenceUrl:`https://www.grants.gov/search-results-detail/${encodeURIComponent(externalId)}`,
    verifiedOn:now.toISOString().slice(0,10),validThrough:new Date(now.getTime()+86400000).toISOString().slice(0,10),
    notes:{en:`Official applicant categories (excerpt): ${labels}.${excerpt} Check exact legal subtype, other requirements and the complete announcement before applying.`,"zh-TW":`官方申請者分類（節錄）：${labels}。${excerpt} 仍需核對精確的法律類型、其他資格與完整公告；本結果不是核准申請資格。`}};
}
/** Bound both requests and wall time; detail failure cannot discard the discovery feed. */
export async function enrichGrantsGovEligibility(rows:GrantListing[],read:(id:string,signal:AbortSignal)=>Promise<unknown>,now=new Date()):Promise<GrantListing[]> {
  const result=rows.map(row=>({...row}));
  const budget=AbortSignal.timeout(20000);
  let next=0;
  const limit=Math.min(rows.length,30);
  await Promise.all(Array.from({length:3},async()=>{
    while(!budget.aborted){
      const index=next++;
      if(index>=limit) return;
      try{result[index].eligibility=parseGrantsGovEligibility(await read(rows[index].externalId,budget),rows[index].externalId,now);}
      catch{result[index].eligibility=null;}
    }
  }));
  return result;
}
