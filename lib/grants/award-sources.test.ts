import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDisciplines } from "./disciplines";
import { gmaCalls, parseGmaCall, parseAwardPage, readAwardSource } from "./award-sources";

test("classification uses titles, supports multiple tags, and does not imply eligibility",()=>{
 assert.deepEqual(classifyDisciplines({title:"SXSW 2027 · Music Festival Showcase"}),["music"]);
 assert.deepEqual(classifyDisciplines({title:"International Songwriting Competition 2026"}),["music"]);
 assert.deepEqual(classifyDisciplines({title:"2026 KCCA ART EXHIBITION OPEN CALL"}),["visual_art"]);
 assert.deepEqual(classifyDisciplines({title:"第17屆金音創作獎"}),["music"]);
 assert.deepEqual(classifyDisciplines({title:"2027 新光三越攝影比賽"}),["photography"]);
 assert.deepEqual(classifyDisciplines({title:"2026 時裝設計新人獎"}),["fashion","design"]);
 assert.deepEqual(classifyDisciplines({title:"藝術支持方案"}),[]);
 assert.deepEqual(classifyDisciplines({title:"青年藝術展",disciplines:["fashion","music","music"]}),["music","fashion"]);
 assert.deepEqual(classifyDisciplines({title:"2026 金馬獎長片類"}),["film"]);
});
test("GMA ignores winners, guards remote URLs, and converts ROC application dates",()=>{
 const row={title:"第三十七屆金曲獎",Source:"https://www.bamid.gov.tw/News_Content.aspx?n=3549&s=246945",Link:"https://grants.moc.gov.tw/Web/PointDetail.jsp?x=1"};
 const calls=gmaCalls([row,{...row,title:row.title+"流行音樂類得獎作品"}]);assert.equal(calls.length,1);
 assert.throws(()=>gmaCalls([{...row,Link:"https://example.com/evil"}]));
 const parsed=parseGmaCall(calls[0],'第三十七屆金曲獎 審查日期 114/11/01 ~ 114/12/01 <section id="s2">受理期間 114/12/01 ~ 115/01/02 23:59:59</section> 頒獎 115/06/27');
 assert.equal(parsed.opensOn,"2025-12-01");assert.equal(parsed.closesOn,"2026-01-02");
 assert.equal(parseGmaCall(calls[0],"第三十七屆金曲獎 受理期間 待公告 審查日期 114/12/01 ~ 115/01/02").sourceStatus,"unknown");
 assert.equal(parseGmaCall(calls[0],'第三十七屆金曲獎 <section id="s2">受理期間 114/12/01 ~ 115/01/02 114/12/05 ~ 115/01/04</section>').closesOn,null);
});
test("Golden Horse splits short and feature calls and never uses ceremony dates",()=>{
 const html="2026第六十三屆金馬獎競賽規章 劇情短片、紀錄短片及動畫短片報名日期為 2026 年 6 月 1 日至 6 月 30 日；劇情片、紀錄片及動畫片報名日期為 2026 年 7 月 1 日至 7 月 31 日。11 月 22 日頒獎";
 const rows=parseAwardPage("goldenhorse",html);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.closesOn),["2026-06-30","2026-07-31"]);
 assert.notEqual(rows[0].externalId,rows[1].externalId);assert.throws(()=>parseAwardPage("goldenhorse","2026 金馬獎 11月22日頒獎"));
 assert.equal(parseAwardPage("goldenhorse",html.replaceAll("2026","2027"))[0].externalId,"2027-short");
});
test("fashion application dates are independent of the award ceremony",()=>{
 const row=parseAwardPage("tfda","時裝設計新人獎 報名期限 Deadline 2026.04.08 ~ 2026.06.30 頒獎 2026.10.15")[0];
 assert.equal(row.closesOn,"2026-06-30");assert.deepEqual(row.disciplines,["fashion","design"]);
 assert.throws(()=>parseAwardPage("tfda","時裝設計新人獎 報名期限 Deadline 2026.02.31 ~ 2026.06.30"));
});
test("KFF keeps short film and XR fee windows separate",()=>{
 const rows=parseAwardPage("kff","2026 高雄電影節國際短片 報名時間：2026年4月1日起至2026年6月10日（UTC+0） 早鳥報名：報名費30美金，2026年4月1日至4月30日 (GMT+8)。 最終報名：報名費80美金，2026年5月1日至6月10日 (GMT+8)。");
 assert.equal(rows.length,2);assert.equal(rows[1].opensOn,"2026-04-01");assert.equal(rows[1].closesOn,"2026-06-10");
});

test("GMA accepts a UTF-8 BOM and fails visibly on malformed feeds",async()=>{
 const row={title:"第三十七屆金曲獎",Source:"https://www.bamid.gov.tw/News_Content.aspx?n=3549&s=246945",Link:"https://grants.moc.gov.tw/Web/PointDetail.jsp?x=1"};
 const rows=await readAwardSource("gma",async url=>url.includes("OpenData")?"\uFEFF"+JSON.stringify([row]):'第三十七屆金曲獎 <section id="s2">受理期間 114/12/01 ~ 115/01/02</section>');
 assert.equal(rows[0].closesOn,"2026-01-02");
 await assert.rejects(()=>readAwardSource("gma",async()=>"invalid"));
 await assert.rejects(()=>readAwardSource("tfda",async()=>"maintenance"));
});
