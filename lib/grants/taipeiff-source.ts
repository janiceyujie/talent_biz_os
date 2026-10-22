import { z } from "zod";
import { grantPlainText, isoDate } from "./domain";
import type { GrantListing } from "./types";
export type PublicRequest=(url:string,signal:AbortSignal,body?:object)=>Promise<string>;
const origin="https://www.taipeiff.taipei";
export const taipeiNewsIndex=origin+"/tw/news?c=38";
const plain=(s:string)=>grantPlainText(s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"")).normalize("NFKC");
const newsSchema=z.object({status:z.literal("success"),totalNum:z.coerce.number().int().nonnegative(),news:z.array(z.object({title:z.string(),uniqueUrl:z.string(),public_time:z.string()})).max(30)});
export function taipeiNewsUrl(value:string):string|null{
 try{const u=new URL(value);return u.origin===origin&&!u.username&&!u.password&&/^\/tw\/news\/[A-Za-z0-9]+$/.test(u.pathname)?u.origin+u.pathname:null;}catch{return null;}
}
export function taipeiQueryToken(html:string):Record<string,string>{
 const block=html.slice(html.indexOf("function getNewsData()"));
 const match=/"([a-f0-9]{32})":\s*"([a-f0-9]{64,512})"/.exec(block);
 if(!match)throw new Error("taipei_news_structure_changed");
 return {[match[1]]:match[2]};
}
const callTitle=/徵件|收件|報名|延期|延長/;
const awardTitle=/雙競賽|台北電影獎|國際新導演競賽|台灣電影行銷(?:創意)?獎/;
const results=/得獎|獲獎|入圍|評審|揭曉|售票|志工|實習|工作坊|論壇/;
export function parseTaipeiNews(value:unknown){
 const page=newsSchema.parse(value);
 return {...page,news:page.news.filter(row=>callTitle.test(row.title)&&awardTitle.test(row.title)&&!results.test(row.title)).map(row=>{
  const url=taipeiNewsUrl(row.uniqueUrl);if(!url)throw new Error("taipei_invalid_url");return {...row,url};
 })};
}
const tracks=[{key:"taipei-film-awards",title:"台北電影獎",match:/台北電影獎/},{key:"taipei-new-talent",title:"台北電影節國際新導演競賽",match:/國際新導演競賽/},{key:"taipei-film-marketing",title:"台灣電影行銷創意獎",match:/台灣電影行銷(?:創意)?獎/}];
/** Only ranges tied to submission verbs qualify; festival/show dates are excluded. */
function submissionDates(body:string,year:number,edition:number){
 const found:Array<{opensOn:string;closesOn:string}>=[];
 const patterns=[
  /(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日(?:起|開始)?(?:開放)?(?:徵件|報名)[^；;。]{0,30}?(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日(?:截止|止)/g,
  /(?:報名日期|報名期間|徵件期間)[：:]?\s*(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日至(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/g,
 ];
 for(const re of patterns)for(const m of body.replace(/\s+/g, "").matchAll(re)){
  if(!m[1]&&year!==edition)continue;
  const startYear=Number(m[1]||year),endYear=Number(m[4]||startYear);
  const opensOn=isoDate(startYear,+m[2],+m[3]),closesOn=isoDate(endYear,+m[5],+m[6]);
  if(!opensOn||!closesOn||opensOn>closesOn)return {opensOn:null,closesOn:null};
  found.push({opensOn,closesOn});
 }
 const unique=[...new Map(found.map(r=>[JSON.stringify(r),r])).values()];
 return unique.length===1?unique[0]:{opensOn:null,closesOn:null};
}
export function parseTaipeiCall(url:string,html:string):GrantListing[]{
 if(!taipeiNewsUrl(url))throw new Error("taipei_invalid_url");
 const heading=/<h2\b[^>]*class="l-editor__title"[^>]*>([\s\S]*?)<\/h2>/.exec(html);
 const content=/<div class="l-editor__content">([\s\S]*?)<\/main>/.exec(html);
 const publication=/<div class="l-editor__date">(20\d{2})[.-](\d{2})[.-](\d{2})<\/div>/.exec(html);
 if(!heading||!content||!publication)throw new Error("taipei_detail_changed");
 const title=plain(heading[1]),body=plain(content[1].replace(/<\/(?:p|h[1-6])>|<br\s*\/?>/gi,"。"));
 if(!callTitle.test(title)||!awardTitle.test(title)||results.test(title))return [];
 const year=Number(/20\d{2}/.exec(title)?.[0]);
 if(!year)throw new Error("taipei_edition_unconfirmed");
 const sentences=body.split(/[；;。]/);
 return tracks.filter(track=>track.match.test(body)).map(track=>{
  // A news article can announce several competitions with different deadlines.
  const relevant=sentences.filter(sentence=>track.match.test(sentence)).join("。");
  const dates=submissionDates(relevant,+publication[1],year);
  const trackTitle=track.key==="taipei-film-marketing"&&!/台灣電影行銷創意獎/.test(body)?"台灣電影行銷獎":track.title;
  return {source:"taipeiff",externalId:`${track.key}-${year}`,region:"TW",kind:"competition",title:`${year} ${trackTitle}`,agency:"台北電影節",url,disciplines:["film"],...dates,sourceStatus:dates.opensOn&&dates.closesOn?"posted":"unknown",summary:relevant.slice(0,500)};
 });
}
export async function readTaipeiSource(request:PublicRequest,knownUrls:string[],now=new Date()):Promise<GrantListing[]>{
 const budget=AbortSignal.timeout(90000),token=taipeiQueryToken(await request(taipeiNewsIndex,budget));
 const urls=new Set(knownUrls.map(taipeiNewsUrl).filter((u):u is string=>!!u));
 // These are public, read-only searches made by the official news page itself.
 for(const search of ["徵件","報名","延期","延長"]){
  for(let page=1;page<=3;page++){
   const parsed=parseTaipeiNews(JSON.parse((await request(origin+"/api/articles/news",budget,{...token,Filter:{Search:search,Nav:"",Year:"",Month:""},NowPage:page,Amount:30})).replace(/^\uFEFF/,"")));
   for(const row of parsed.news)if(Number(row.public_time.slice(0,4))>=now.getUTCFullYear()-1)urls.add(row.url);
   if(page*30>=parsed.totalNum)break;
   if(page===3)throw new Error("taipei_result_limit");
  }
 }
 if(urls.size>30)throw new Error("taipei_detail_limit");
 const listings=new Map<string,GrantListing>();
 for(const url of urls){
  for(const row of parseTaipeiCall(url,await request(url,budget))){
   const prior=listings.get(row.externalId);
   // Do not silently resolve competing deadline announcements. Unknown dates require official review.
   if(prior&&(prior.opensOn!==row.opensOn||prior.closesOn!==row.closesOn))listings.set(row.externalId,{...row,opensOn:null,closesOn:null,sourceStatus:"unknown"});
   else if(!prior)listings.set(row.externalId,row);
  }
 }
 return [...listings.values()];
}
