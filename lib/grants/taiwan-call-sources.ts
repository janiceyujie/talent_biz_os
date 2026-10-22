import { grantPlainText, isoDate } from "./domain";
import type { GrantListing } from "./types";
import type { PublicRequest } from "./taipeiff-source";

export const additionalSources = ["taipeiff", "skm", "kmfa_award"] as const;
const skmOrigin="https://culture.skm.com.tw", kmfaOrigin="https://awardkmfa.org.tw";
const plain=(html:string)=>grantPlainText(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")).normalize("NFKC");
const noDates={opensOn:null,closesOn:null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function skmUrl(value:string):string|null {
 try {const u=new URL(value,skmOrigin);if(u.origin!==skmOrigin||u.username||u.password||!/^\/ActEvent\/Cweb\/(?:ActiveContent|ManualDownload)?$/i.test(u.pathname)||!uuid.test(u.searchParams.get("ActUUID")||""))return null;
 const menu=u.searchParams.get("MenuUUID");if(menu&&!uuid.test(menu))return null;u.hash="";u.searchParams.sort();return u.href;}catch{return null;}
}
export function kmfaUrl(value:string):string|null {
 try {const u=new URL(value,kmfaOrigin);return u.origin===kmfaOrigin&&!u.username&&!u.password&&/^\/announcements\/Details\/\d+$/.test(u.pathname)?u.origin+u.pathname:null;}catch{return null;}
}
/** Reviewed editions are matched by track and year, never by a shared announcement URL alone. */
export function reviewedCallIdentity(source:string, externalId:string, url:string):string|null {
 try {const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
 if((source==="taipeiff"||source==="reviewed")&&u.hostname==="www.taipeiff.taipei"&&/^\/tw\/news\/[a-z0-9]+$/i.test(u.pathname)&&/^taipei-(film-awards|new-talent|film-marketing)-20\d{2}$/.test(externalId))return externalId;
 if((source==="skm"||source==="reviewed")&&skmUrl(url)&&/^skm-(photo-contest|analog|photo-sponsorship)-20\d{2}$/.test(externalId))return externalId;
 if((source==="kmfa_award"||source==="reviewed")&&u.hostname==="awardkmfa.org.tw"&&(u.pathname==="/"||kmfaUrl(url))&&/^kaohsiung-award-20\d{2}$/.test(externalId))return externalId;
 return null;}catch{return null;}
}
export function labelledCallDates(html:string) {
 const body=plain(html).replace(/\s+/g,"");const dates=[];
 const re=/(?:收件日期|徵件時間|徵件期間)[：:｜|]?(20\d{2})[/.年](\d{1,2})[/.月](\d{1,2})日?(?:起)?[~～—–－至-](?:(20\d{2})[/.年])?(\d{1,2})[/.月](\d{1,2})日?/g;
 for(const m of body.matchAll(re)){const opensOn=isoDate(+m[1],+m[2],+m[3]),closesOn=isoDate(+(m[4]||m[1]),+m[5],+m[6]);if(!opensOn||!closesOn||opensOn>closesOn)return noDates;dates.push({opensOn,closesOn});}
 const unique=[...new Map(dates.map(d=>[JSON.stringify(d),d])).values()];return unique.length===1?unique[0]:noDates;
}
const skmTracks=[
 {key:"photo-contest",match:/(?:新光三越|國際)攝影大賽/,title:"SKM PHOTO 新光三越國際攝影大賽",kind:"competition" as const},
 {key:"analog",match:/類比攝影創作徵選/,title:"類比攝影創作徵選",kind:"exhibition" as const},
 {key:"photo-sponsorship",match:/吳東興攝影贊助計畫/,title:"吳東興攝影贊助計畫",kind:"grant" as const},
];
type SkmCandidate={externalId:string;url:string;year:number;track:typeof skmTracks[number]};
function links(html:string) {return [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:grantPlainText(m[1]),text:plain(/<(?:h2|div)[^>]*class="[^"]*(?:__title|copy__title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|div)>/.exec(m[2])?.[1] || m[2])}));}
export function discoverSkm(html:string):SkmCandidate[] {
 if(!html.includes("skm-article")&&!html.includes("skm-banner"))throw new Error("skm_index_changed");
 const rows=new Map<string,SkmCandidate>();
 for(const link of links(html)){const url=skmUrl(link.url),year=Number(/20\d{2}/.exec(link.text)?.[0]),track=skmTracks.find(t=>t.match.test(link.text));
 if(!url||!year||!track||/得獎|獲獎|入選名單|成果/.test(link.text))continue;
 const externalId=`skm-${track.key}-${year}`,prior=rows.get(externalId);
 if(!prior||(/ActiveContent/i.test(url)&&!/ActiveContent/i.test(prior.url)))rows.set(externalId,{externalId,url,year,track});
 }if(rows.size>20)throw new Error("skm_detail_limit");return [...rows.values()];
}
export function parseSkmCall(candidate:SkmCandidate,url:string,html:string):GrantListing {
 const body=plain(html);if(!skmUrl(url)||!candidate.track.match.test(body)||!html.includes("skm-article")||new URL(url).searchParams.get("ActUUID")!==new URL(candidate.url).searchParams.get("ActUUID"))throw new Error("skm_detail_changed");
 const dates=labelledCallDates(html);
 return {source:"skm",externalId:candidate.externalId,title:`${candidate.year} ${candidate.track.title}`,agency:"新光三越文教基金會",region:"TW",kind:candidate.track.kind,disciplines:["photography"],url,...dates,sourceStatus:dates.closesOn?"posted":"unknown",summary:candidate.track.title};
}
export async function readSkmSource(request:PublicRequest):Promise<GrantListing[]> {
 const budget=AbortSignal.timeout(90000),rows=[];
 for(const candidate of discoverSkm(await request(skmOrigin+"/",budget))){
 let url=candidate.url,html=await request(url,budget);
 if(!/ActiveContent/i.test(url)){
 const detail=links(html).find(l=>candidate.track.match.test(l.text)&&/ActiveContent/i.test(l.url)&&skmUrl(l.url)&&new URL(skmUrl(l.url)!).searchParams.get("ActUUID")===new URL(url).searchParams.get("ActUUID"));
 if(!detail)throw new Error("skm_rules_missing");url=skmUrl(detail.url)!;html=await request(url,budget);
 }
 rows.push(parseSkmCall(candidate,url,html));
 }return rows;
}
export function discoverKmfa(html:string):string[] {
 if(!html.includes("/announcements"))throw new Error("kmfa_index_changed");
 const urls=[...new Set(links(html).map(l=>kmfaUrl(l.url)).filter((u):u is string=>!!u))];
 if(urls.length>20)throw new Error("kmfa_detail_limit");return urls;
}
export function parseKmfaCall(url:string,html:string):GrantListing|null {
 const title=/<h2 class="card-title[^>]*>([\s\S]*?)<\/h2>/.exec(html),content=/<div class="announce-content">([\s\S]*?)<\/div>/.exec(html);
 if(!kmfaUrl(url)||!title||!content)throw new Error("kmfa_detail_changed");
 const heading=plain(title[1]);if(!/高雄獎/.test(heading)||!/徵件|報名|延期|延長/.test(heading)||/得獎|入選|評審|揭曉/.test(heading))return null;
 const year=/20\d{2}/.exec(heading)?.[0];if(!year)throw new Error("kmfa_edition_unconfirmed");
 const dates=labelledCallDates(content[1]);return {source:"kmfa_award",externalId:`kaohsiung-award-${year}`,title:`${year} 高雄獎`,agency:"高雄市立美術館",region:"TW",kind:"competition",disciplines:["visual_art","multidisciplinary"],url,...dates,sourceStatus:dates.closesOn?"posted":"unknown",summary:plain(content[1]).slice(0,500)};
}
export async function readKmfaSource(request:PublicRequest,knownUrls:string[]):Promise<GrantListing[]> {
 const budget=AbortSignal.timeout(60000),urls=new Set([...discoverKmfa(await request(kmfaOrigin+"/announcements",budget)),...knownUrls.map(kmfaUrl).filter((u):u is string=>!!u)]);
 if(urls.size>20)throw new Error("kmfa_detail_limit");const rows=new Map<string,GrantListing>();
 for(const url of urls){const row=parseKmfaCall(url,await request(url,budget));if(row){const prior=rows.get(row.externalId);rows.set(row.externalId,prior&&(prior.opensOn!==row.opensOn||prior.closesOn!==row.closesOn)?{...row,...noDates,sourceStatus:"unknown"}:row);}}
 return [...rows.values()];
}
