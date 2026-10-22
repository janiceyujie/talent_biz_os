import { z } from "zod";
import { grantPlainText, isoDate } from "./domain";
import type { GrantListing } from "./types";
export const awardSources = ["gma", "goldenhorse", "kff", "tfda"] as const;
export type AwardSource = (typeof awardSources)[number];
export const awardUrls: Record<AwardSource,string> = {
  gma:"https://www.bamid.gov.tw/OpenData.aspx?SN=E2D6D82D647601C0",
  goldenhorse:"https://www.goldenhorse.org.tw/awards/submission/guidelines/",
  kff:"https://www.kff.tw/about/brochure",
  tfda:"https://www.tfdaward.com/FTournament",
};
const plain=(html:string)=>grantPlainText(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi," "));
const date=(y:string,m:string,d:string)=>isoDate(+y<1911?+y+1911:+y,+m,+d);
const range=(a:string|null,b:string|null)=>{
  if(!a||!b||a>b)throw new Error("award_invalid_dates");
  return {opensOn:a,closesOn:b};
};
function entry(source:AwardSource,id:string,title:string,dates:{opensOn:string|null;closesOn:string|null},summary:string):GrantListing {
  return {source,externalId:id,title,url:awardUrls[source],region:"TW",agency:{gma:"文化部影視及流行音樂產業局",goldenhorse:"台北金馬影展執行委員會",kff:"高雄電影節",tfda:"時裝設計新人獎"}[source],kind:"competition",sourceStatus:dates.opensOn&&dates.closesOn?"posted":"unknown",...dates,summary,disciplines:source==="gma"?["music"]:source==="tfda"?["fashion","design"]:["film"]};
}
/** Annual pages use edition/year IDs so next year's call never overwrites a tracked application. */
export function parseAwardPage(source:Exclude<AwardSource,"gma">,html:string):GrantListing[]{
  const body=plain(html);
  if(source==="goldenhorse"){
    const header=/(20\d{2})\s*第[^\s]{1,10}屆金馬獎競賽規章/.exec(body);
    const text=header?body.slice(header.index):"";
    const short=/劇情短片、紀錄短片及動畫短片報名日期為\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日至\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
    const feature=/劇情片、紀錄片及動畫片報名日期為\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日至\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
    if(!header||!short||!feature||short[1]!==header[1]||feature[1]!==header[1])throw new Error("goldenhorse_structure_changed");
    return [["short",short,"短片類"],["feature",feature,"長片類"]].map(([id,m,label])=>{
      const r=m as RegExpExecArray;
      return entry(source,`${header[1]}-${id}`,`${header[1]} 金馬獎 · ${label}`,range(date(r[1],r[2],r[3]),date(r[1],r[4],r[5])),"長片與短片報名期間不同。請核對官方競賽規章、影片完成／放映時間及權利資格；入圍與頒獎日期不是報名截止日。");
    });
  }
  if(source==="tfda"){
    if(!body.includes("時裝設計新人獎"))throw new Error("tfda_structure_changed");
    const m=/報名期限\s*Deadline\s*(20\d{2})\.(\d{2})\.(\d{2})\s*~\s*(20\d{2})\.(\d{2})\.(\d{2})/.exec(body);
    if(!m)throw new Error("tfda_dates_changed");
    return [entry(source,m[1],`${m[1]} TFDA 時裝設計新人獎`,range(date(m[1],m[2],m[3]),date(m[4],m[5],m[6])),"國籍不限；需依簡章提交設計稿與服裝成品資料，並揭露 AI 輔助使用情形。請另核對送件、審核與決賽時程。")];
  }
  const compact=body.replace(/\s+/g,"");
  const header=/(20\d{2})\s*高雄電影節國際短片/.exec(compact);
  const m=/報名時間[：:]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日起至(20\d{2})年(\d{1,2})月(\d{1,2})日/.exec(compact);
  const xr=/早鳥報名[：:][\s\S]{0,30}?(20\d{2})年(\d{1,2})月(\d{1,2})日至[\s\S]{0,100}?最終報名[：:][\s\S]{0,30}?(20\d{2})年\d{1,2}月\d{1,2}日至(\d{1,2})月(\d{1,2})日/.exec(compact);
  if(!header||!m||!xr||m[1]!==header[1]||xr[1]!==header[1])throw new Error("kff_structure_changed");
  return [entry(source,`${header[1]}-short`,`${header[1]} 高雄電影節國際短片競賽`,range(date(m[1],m[2],m[3]),date(m[4],m[5],m[6])),"國際組與臺灣組擇一報名。短片需符合片長、完成時間與組別資格；官方截止時區為 UTC+0，請以官方報名頁為準。"),entry(source,`${header[1]}-xr`,`${header[1]} 高雄電影節 XR 國際競賽`,range(date(xr[1],xr[2],xr[3]),date(xr[4],xr[5],xr[6])),"XR 作品須符合沉浸式體驗及完成時間規定。早鳥與最終報名費不同，截止時區 GMT+8，另需完成官方要求的報名表單。")];
}
const indexSchema=z.array(z.object({title:z.string(),Link:z.string(),Source:z.string()})).max(500);
export function gmaCalls(value:unknown){
  const calls=indexSchema.parse(value).filter(r=>/^第[一二三四五六七八九十百\d]+屆金曲獎$/.test(r.title));
  if(!calls.length)throw new Error("gma_empty_index");
  // The official index is newest first. Inspect two editions; older rows remain cached.
  return calls.slice(0,2).map(row=>{
    const link=new URL(row.Link),source=new URL(row.Source);
    if(link.origin!=="https://grants.moc.gov.tw"||link.pathname!=="/Web/PointDetail.jsp"||source.origin!=="https://www.bamid.gov.tw"||source.pathname!=="/News_Content.aspx"||!/^\d+$/.test(source.searchParams.get("s")??""))throw new Error("gma_invalid_url");
    return {...row,id:source.searchParams.get("s")!};
  });
}
export function parseGmaCall(call:ReturnType<typeof gmaCalls>[number],html:string):GrantListing {
  const body=plain(html);
  const section=/<section\b[^>]*id="s2"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  if(!body.includes(call.title)||!body.includes("受理期間"))throw new Error("gma_structure_changed");
  const matches=[...plain(section?.[1]??"").matchAll(/(\d{3})\/(\d{2})\/(\d{2})\s*~\s*(\d{3})\/(\d{2})\/(\d{2})/g)];
  const ranges=matches.map(m=>range(date(m[1],m[2],m[3]),date(m[4],m[5],m[6])));
  const distinct=[...new Map(ranges.map(r=>[JSON.stringify(r),r])).values()];
  const dates=distinct.length===1?distinct[0]:{opensOn:null,closesOn:null};
  return {...entry("gma",call.id,call.title,dates,"金曲獎流行音樂類。請核對官方報名須知、作品發行期間與個別組別資格；資料未能確定時會標示待確認。"),url:call.Source};
}
export async function readAwardSource(source:AwardSource,fetchText:(url:string,signal:AbortSignal)=>Promise<string>):Promise<GrantListing[]>{
  const budget=AbortSignal.timeout(60000);
  const html=await fetchText(awardUrls[source],budget);
  if(source!=="gma")return parseAwardPage(source,html);
  const rows=[];
  for(const call of gmaCalls(JSON.parse(html.replace(/^\uFEFF/,""))))rows.push(parseGmaCall(call,await fetchText(call.Link,budget)));
  return rows;
}
