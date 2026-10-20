import { z } from "zod";
import { eligibilityRuleSchema } from "./eligibility";
import { opportunityKinds } from "./types";

export const reviewedOpportunitySchema=z.object({
  externalId:z.string().min(1).max(100),kind:z.enum(opportunityKinds),region:z.enum(["TW","US"]),
  title:z.string().min(1).max(300),agency:z.string().min(1).max(200),
  url:z.url().refine(url=>new URL(url).protocol==="https:"),
  opensOn:z.iso.date().nullable(),closesOn:z.iso.date().nullable(),
  sourceStatus:z.enum(["posted","forecasted","unknown"]),summary:z.string().max(2000),
  reviewedOn:z.iso.date(),eligibility:eligibilityRuleSchema.nullable(),
});
const review={version:1,verifiedOn:"2026-10-20",validThrough:"2026-11-19"} as const;
/** Reviewed snapshots, not an automatic feed. Never advance review dates merely by importing again. */
export const reviewedCatalogue=z.array(reviewedOpportunitySchema).parse([
  {externalId:"sxsw-music-2027",kind:"showcase",region:"US",title:"SXSW 2027 · Music Festival Showcase",agency:"SXSW",
    url:"https://sxsw.com/music-festival/",opensOn:null,closesOn:"2026-11-20",sourceStatus:"posted",reviewedOn:"2026-10-20",
    summary:"Official artist showcase application. The listed closing date is not a confirmed cutoff time. Review fees, travel arrangements and application terms before applying.",
    eligibility:{...review,applicantTypes:null,countries:null,evidenceUrl:"https://sxsw.com/music-festival/",notes:{en:"A SXSW ID and an authorized, reachable primary contact are required. Music selection is reviewed by the organizer; entry does not guarantee a performance.","zh-TW":"需有 SXSW ID，並指定能回覆通知的授權聯絡人。主辦單位會評選，送件不代表獲得演出機會；費用與差旅安排需另外確認。"}}},
  {externalId:"isc-2026",kind:"competition",region:"US",title:"International Songwriting Competition 2026",agency:"International Songwriting Competition",
    url:"https://songwritingcompetition.com/rules",opensOn:null,closesOn:"2026-11-23",sourceStatus:"posted",reviewedOn:"2026-10-20",
    summary:"The extended entry deadline is November 23, 2026. Later promotions may have different windows. Check the selected category, current fee and official cutoff time.",
    eligibility:{...review,applicantTypes:null,countries:["TW","US","other"],evidenceUrl:"https://songwritingcompetition.com/rules",notes:{en:"International entries are accepted. Check authorship and rights, the Teen age limit, special-category restrictions, fees and AI-use disclosures.","zh-TW":"接受國際報名。仍需核對作品作者與權利、青少年組年齡、特殊組別限制、報名費與 AI 使用揭露規則。"}}},
  {externalId:"creative-expo-next-call",kind:"exhibition",region:"TW",title:"臺灣文博會 · 後續徵展公告追蹤",agency:"臺灣文博會",
    url:"https://creativexpo.tw/zh-TW",opensOn:null,closesOn:null,sourceStatus:"unknown",reviewedOn:"2026-10-20",
    summary:"2026 activities have concluded. This is a source to follow for the next exhibitor call, not a currently open application. The next application dates and requirements are not confirmed.",eligibility:null},
  {externalId:"nea-gap-2026-july",kind:"grant",region:"US",title:"NEA Grants for Arts Projects · July 2026 cycle",agency:"National Endowment for the Arts",
    url:"https://www.arts.gov/grants/grants-for-arts-projects",opensOn:null,closesOn:"2026-07-09",sourceStatus:"posted",reviewedOn:"2026-10-20",
    summary:"The July 2026 first-stage deadline has passed. Keep this cycle separate from future funding rounds; do not reuse its dates for the next application.",
    eligibility:{...review,applicantTypes:["nonprofit","government","tribal"],countries:["US"],evidenceUrl:"https://www.arts.gov/grants/grants-for-arts-projects",notes:{en:"Eligible types include US tax-exempt nonprofits, state/local governments and federally recognized tribes. Confirm five years of arts programming, at least $20,000 operating expenses, matching funds and exclusions; individuals and businesses are not eligible.","zh-TW":"可申請類型包含美國具免稅資格的非營利組織、州／地方政府與聯邦認可部落。仍需確認五年藝術活動經驗、至少兩萬美元營運支出、自籌款及排除規定；個人與營利企業不適用。"}}}
]);
