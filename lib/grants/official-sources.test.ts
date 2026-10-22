import {parseCronItems} from "graphile-worker";
import {GRANT_REFRESH_CRON,GRANT_REFRESH_OPTIONS} from "./refresh-policy";
import {test} from "node:test";
import assert from "node:assert/strict";
import {applicationDates,callHeaderDates,discoverOfficialCalls,officialIdentity,parseOfficialCall,readOfficialSource} from "./official-sources";

const candidate={id:"246",url:"https://cycc.org.tw/zh-hant/node/246",title:"【徵件】創意畢業季"};
const cyccDetail=(body:string)=>`<h1>${candidate.title}</h1><div property="content:encoded">${body}</div>`;
const cyccIndex=(id="246")=>`eventpage-item <h3><a href="/zh-hant/node/${id}">【徵件】創意畢業季</a></h3><h3><a href="/zh-hant/node/999">本月展覽</a></h3>`;
const svDetail=(title="台灣歌曲大賽",body="台灣創作者報名。")=>`<h1>${title}</h1><div class="col-md-8 col-lg-9 text-read text-break mb-5">${body}</div><a data-href="https://www.google.com/calendar/event?text=徵選收件開始&dates=20260923T165500/20260923T165500">開始</a><a data-href="https://www.google.com/calendar/event?text=徵選收件截止&dates=20261113T235900/20261113T235900">截止</a><span>2027-01-01 活動結束</span>`;

test("only application calls are discovered, including CYCC aliases; navigation, results and remote links are excluded",()=>{
 const html=cyccIndex()+`<a href="/zh-hant/venue-booking-2027">【申請】展演檔期</a><a href="https://evil.test/zh-hant/node/5">徵件</a><a href="/zh-hant/node/7">徵件獲選名單</a>`;
 assert.deepEqual(discoverOfficialCalls("cycc",html).map(r=>r.id),["246","venue-booking-2027"]);
 assert.throws(()=>discoverOfficialCalls("cycc","<h1>Maintenance</h1>"));
});
test("official identity adopts locale variants but rejects credentialed, remote and non-HTTPS URLs",()=>{
 assert.equal(officialIdentity("https://www.kingcarart.org.tw/projects-detail/208"),officialIdentity("https://www.kingcarart.org.tw/en/projects-detail/208"));
 for(const u of ["http://cycc.org.tw/zh-hant/node/1","https://evil.test/opportunities/1/","https://user@cycc.org.tw/zh-hant/node/1","https://cycc.org.tw:999/zh-hant/node/1"])assert.equal(officialIdentity(u),null);
});
test("application periods use explicit labels, not exhibition dates, with invalid and ambiguous dates unconfirmed",()=>{
 assert.deepEqual(applicationDates("展期：2027/5/19 - 2027/6/14 受理時間: 2026/5/19（二）起至2026/10/30（五）23:59止"),{opensOn:"2026-05-19",closesOn:"2026-10-30"});
 for(const body of ["展期：2027/5/19 - 2027/6/14","申請日期: 2026/2/30至2026/3/31","申請日期: 2026/5/1至2026/5/30 申請日期: 2026/6/1至2026/6/30"])assert.equal(applicationDates(body).closesOn,null);
});
test("King Car official open-call header supports year boundaries without guessing invalid months",()=>{
 assert.deepEqual(callHeaderDates('<div class="ex-date">Dec. 01 2026 → Jan. 30 2027</div>'),{opensOn:"2026-12-01",closesOn:"2027-01-30"});
 assert.equal(callHeaderDates('<div class="ex-date">Bad. 01 → Sep. 30 2026</div>').opensOn,null);
});
test("StreetVoice reads submission-calendar dates rather than performance dates; overseas calls are not Taiwan",()=>{
 const c={id:"1103",url:"https://streetvoice.com/opportunities/1103/",title:""};
 const row=parseOfficialCall("streetvoice",c,svDetail());
 assert.equal(row?.closesOn,"2026-11-13");assert.equal(row?.kind,"competition");
 assert.equal(parseOfficialCall("streetvoice",c,svDetail("馬來西亞創作歌曲觀摩賽","台灣平台合作")),null);
 const conflict=parseOfficialCall("streetvoice",c,svDetail(undefined,"台灣報名期間：2026/9/23至2026/10/30"));
 assert.equal(conflict?.sourceStatus,"unknown");assert.equal(conflict?.closesOn,null);
});
test("automatic fetch does not certify eligibility or invent unknown dates",()=>{
 const row=parseOfficialCall("cycc",candidate,cyccDetail("2027年展演。資格請閱讀簡章。"));
 assert.equal(row?.sourceStatus,"unknown");assert.equal(row?.opensOn,null);assert.equal(row?.eligibility,undefined);
 assert.throws(()=>parseOfficialCall("cycc",candidate,"login required"));
});
test("new index entries are discovered on a later run, duplicate links yield one entry, known calls remain checked",async()=>{
 const reads:string[]=[];
 const request=async(url:string)=>{reads.push(url);return url.includes("events")?cyccIndex("300")+cyccIndex("300"):cyccDetail("申請日期: 2026年9月1日至2026年10月30日");};
 const rows=await readOfficialSource("cycc",request,[candidate.url,"http://127.0.0.1/private","https://evil.test/a"]);
 assert.deepEqual(rows.map(r=>r.externalId),["300","246"]);
 assert.equal(reads.length,3);assert.ok(reads.every(u=>u.startsWith("https://cycc.org.tw/")));
});
test("detail failures reject the source snapshot instead of returning a partial success",async()=>{
 await assert.rejects(readOfficialSource("cycc",async url=>{if(url.includes("events"))return cyccIndex();throw new Error("network_timeout");}),/network_timeout/);
});
test("a valid index with ordinary events only does not create fake calls",async()=>{
 const rows=await readOfficialSource("cycc",async()=>`eventpage-item <h3><a href="/zh-hant/node/999">藝術展覽活動</a></h3>`);
 assert.equal(rows.length,0);
});

test("daily schedule uses supported queue backfill for the latest missed run and three attempts",()=>{
 const [cron]=parseCronItems([{task:"grants.refresh",match:GRANT_REFRESH_CRON,options:GRANT_REFRESH_OPTIONS}]);
 assert.equal(cron.task,"grants.refresh");assert.equal(cron.options.backfillPeriod,86400000);assert.equal(cron.options.maxAttempts,3);
});
