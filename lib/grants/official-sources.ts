import { grantPlainText, isoDate } from "./domain";
import type { GrantListing, OpportunityKind } from "./types";

export const officialSources = ["streetvoice", "cycc", "kingcar"] as const;
export type OfficialSource = (typeof officialSources)[number];
type Listing = GrantListing & {kind: OpportunityKind};
type Candidate = {id:string;url:string;title:string};
export const sourceIndexes: Record<OfficialSource,string> = {
  streetvoice:"https://streetvoice.com/opportunities/",
  cycc:"https://cycc.org.tw/zh-hant/events",
  kingcar:"https://www.kingcarart.org.tw/en/projects/award",
};
const text = (html:string) => grantPlainText(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,""));
const callTitle = /徵件|徵選|招募|申請|競賽|比賽|大賽|駐館|open call|award/i;
const resultTitle = /獲選|入選名單|結果公告|得獎|評選結果|名單公告|results|winners/i;
/** Canonical identity survives locale redirects and manual-to-automatic adoption. */
export function officialIdentity(url:string):string|null {
  try {
    const u=new URL(url); if(u.protocol!=="https:" || u.username || u.password || u.port) return null;
    const id=u.hostname==="streetvoice.com"? /^\/opportunities\/(\d+)\/$/.exec(u.pathname):
      u.hostname==="cycc.org.tw"? /^\/zh-hant\/(?:node\/)?([a-zA-Z0-9_-]+)$/.exec(u.pathname):
      u.hostname==="www.kingcarart.org.tw"? /^\/(?:en\/|zh_TW\/)?projects-detail\/(\d+)$/.exec(u.pathname):null;
    return id?`${u.hostname}:${id[1]}`:null;
  }catch{return null;}
}
function anchors(html:string,base:string):Candidate[] {
  const rows=new Map<string,Candidate>();
  for(const a of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
    const url=new URL(grantPlainText(a[1]),base); const key=officialIdentity(url.href);
    if(!key || url.origin!==new URL(base).origin) continue;
    const title=text(a[2].replace(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi,""));
    if(!title || /^(DETAIL|前往徵選|查看活動)$/i.test(title))continue;
    const id=key.split(":")[1];
    rows.set(id,{id,url:url.origin+url.pathname,title:title.slice(0,300)});
  }
  return [...rows.values()];
}
export function discoverOfficialCalls(source:OfficialSource,html:string):Candidate[]{
  const markers={streetvoice:'徵選活動',cycc:'eventpage-item',kingcar:'p-archive-group'};
  if(!html.includes(markers[source]))throw new Error(`${source}_structure_changed`);
  // CYCC also lists ordinary performances; never turn audience events into application opportunities.
  const rows=anchors(html,sourceIndexes[source]);
  if(!rows.length)throw new Error(`${source}_empty_index`);
  return rows.filter(r=>source==="streetvoice" || (callTitle.test(r.title)&&!resultTitle.test(r.title)));
}
/** Only explicit application ranges qualify. Exhibition dates and fiscal years are not deadlines. */
export function applicationDates(body:string):{opensOn:string|null;closesOn:string|null}{
  const ranges:Array<[string,string]>=[];
  const date=String.raw`(20\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?`;
  const regex=new RegExp(String.raw`(?:受理時間|申請日期|申請期間|收件期間|收件日期|報名期間|報名時間|徵件期間|徵件時間)\s*[:：｜]?\s*${date}[\s\S]{0,35}?(?:至|到|～|~|—|–|－|-)\s*${date}`,"g");
  for(const m of body.matchAll(regex)){
    const a=isoDate(+m[1],+m[2],+m[3]),b=isoDate(+m[4],+m[5],+m[6]);
    if(a&&b&&a<=b)ranges.push([a,b]);
  }
  const unique=[...new Map(ranges.map(r=>[r.join("/"),r])).values()];
  return unique.length===1?{opensOn:unique[0][0],closesOn:unique[0][1]}:{opensOn:null,closesOn:null};
}
export function callHeaderDates(html:string):{opensOn:string|null;closesOn:string|null}{
  const header=/<div class="ex-date">([\s\S]*?)<\/div>/.exec(html);
  const match=header && /([A-Za-z]{3})\.?\s+(\d{1,2})(?:\s+(20\d{2}))?\s*→\s*([A-Za-z]{3})\.?\s+(\d{1,2})\s+(20\d{2})/.exec(text(header[1]));
  if(!match)return {opensOn:null,closesOn:null};
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const a=isoDate(+(match[3]||match[6]),months.indexOf(match[1])+1,+match[2]);
  const b=isoDate(+match[6],months.indexOf(match[4])+1,+match[5]);
  return a&&b&&a<=b?{opensOn:a,closesOn:b}:{opensOn:null,closesOn:null};
}
export function parseOfficialCall(source:OfficialSource,c:Candidate,html:string):Listing|null {
  let title=c.title,body="",opensOn:string|null=null,closesOn:string|null=null;
  let kind:OpportunityKind="exhibition";
  if(source==="streetvoice"){
    const h=/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    const b=/<div class="col-md-8 col-lg-9 text-read text-break mb-5">([\s\S]*?)<\/div>/.exec(html);
    if(!h||!b)throw new Error("streetvoice_detail_changed");
    title=text(h[1]);body=text(b[1]);
    // This feed includes overseas calls. Host geography must not be guessed from the website locale.
    if(/馬來西亞|香港|中國大陸|新加坡|大馬/.test(title+body.slice(0,500)) || !/台灣|臺灣|全臺|全台|國內|台北|臺北|高雄|新北|臺中|台中/.test(title+body))return null;
    const calendarDate=(label:string)=>{
      const matches=[...html.matchAll(/data-href="([^"]+)"/g)].map(m=>grantPlainText(m[1]));
      const values=matches.filter(v=>v.includes(label)).map(v=>/[?&]dates=(\d{4})(\d{2})(\d{2})T/.exec(v)).filter(v=>v!==null).map(v=>isoDate(+v[1],+v[2],+v[3]));
      return values.length===1?values[0]:null;
    };
    opensOn=calendarDate("徵選收件開始");closesOn=calendarDate("徵選收件截止");
    const explicit=applicationDates(body);
    if(explicit.closesOn && explicit.closesOn!==closesOn){opensOn=null;closesOn=null;}
    kind=/比賽|大賽|獎|歌曲徵選/.test(title)?"competition":"showcase";
  }else if(source==="cycc"){
    const h=/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    const b=/property="content:encoded">([\s\S]*?)<\/div>/.exec(html);
    if(!h||!b)throw new Error("cycc_detail_changed");
    title=text(h[1]);body=text(b[1]);
    ({opensOn,closesOn}=applicationDates(body));
    kind=/競賽|比賽|大賽/.test(title)?"competition":"exhibition";
  }else{
    const h=/<title>([\s\S]*?)<\/title>/.exec(html);
    const b=/<div class="editor-box">([\s\S]*?)<\/div>/.exec(html);
    if(!h||!b||!html.includes("AWARDS &"))throw new Error("kingcar_detail_changed");
    title=text(h[1]).split(" | ")[0];body=text(b[1]);
    const explicit=applicationDates(body),header=callHeaderDates(html);
    ({opensOn,closesOn}=header);
    if(explicit.closesOn && header.closesOn && explicit.closesOn!==header.closesOn){opensOn=null;closesOn=null;}
    else if(explicit.closesOn)({opensOn,closesOn}=explicit);
    kind=/音樂會|concert|recital/i.test(title)?"showcase":/比賽|競賽|獎|award/i.test(title)?"competition":"exhibition";
  }
  if(!title || !body || title.length>300)throw new Error("official_empty_detail");
  // Preserve only a short source excerpt. Eligibility is not automatically certified by a successful fetch.
  return {source,externalId:c.id,region:"TW",title,agency:{streetvoice:"StreetVoice",cycc:"中原文創園區",kingcar:"金車文藝中心"}[source],url:c.url,kind,opensOn,closesOn,sourceStatus:opensOn&&closesOn?"posted":"unknown",summary:body.slice(0,500)};
}
export async function readOfficialSource(source:OfficialSource,request:(url:string,signal:AbortSignal)=>Promise<string>,knownUrls:string[]=[]):Promise<Listing[]>{
  const budget=AbortSignal.timeout(90000);
  const candidates=new Map<string,Candidate>();
  // Fixed URLs and bounded pages prevent arbitrary outbound requests from untrusted HTML.
  const pages=source==="streetvoice"?3:source==="cycc"?2:1;
  for(let page=0;page<pages;page++){
    const url=sourceIndexes[source]+(page?`?page=${source==="streetvoice"?page+1:page}`:"");
    const html=await request(url,budget);
    for(const row of discoverOfficialCalls(source,html))candidates.set(row.id,row);
    if(!/rel="next"|下一頁|pager-next|page-link/.test(html))break;
  }
  for(const url of knownUrls){
    const identity=officialIdentity(url);
    if(identity && new URL(url).origin===new URL(sourceIndexes[source]).origin){
      const id=identity.split(":")[1];
      const canonical=source==="kingcar"?`https://www.kingcarart.org.tw/en/projects-detail/${id}`:url;
      if(!candidates.has(id))candidates.set(id,{id,url:canonical,title:""});
    }
  }
  if(candidates.size>80)throw new Error("official_result_limit");
  const entries=[...candidates.values()]; const rows:Listing[]=[];
  // Two concurrent detail reads; any failure keeps the entire source's previous snapshot intact.
  for(let i=0;i<entries.length;i+=2){
    const batch=await Promise.all(entries.slice(i,i+2).map(async c=>parseOfficialCall(source,c,await request(c.url,budget))));
    rows.push(...batch.filter((r):r is Listing=>r!==null));
  }
  return rows;
}
