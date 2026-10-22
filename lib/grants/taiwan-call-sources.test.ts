import {test} from "node:test";
import assert from "node:assert/strict";
import {parseTaipeiCall,parseTaipeiNews,readTaipeiSource,taipeiNewsIndex,taipeiQueryToken,taipeiNewsUrl} from "./taipeiff-source";
import {discoverSkm,parseSkmCall,readSkmSource,discoverKmfa,parseKmfaCall,labelledCallDates,reviewedCallIdentity,skmUrl,kmfaUrl} from "./taiwan-call-sources";
const taipei="https://www.taipeiff.taipei/tw/news/abc123";
const detail=(body:string,title="2026台北電影節雙競賽徵件開跑",date="2026.02.06")=>`<h2 class="l-editor__title">${title}</h2><div class="l-editor__date">${date}</div><div class="l-editor__content">${body}</main>`;
const calls="2026第28屆台北電影節將於6月26日至7月11日舉行，台北電影獎與國際新導演競賽自2月6日起開放徵件，並於3月13日截止；台灣電影行銷創意獎2月6日起徵件，3月20日截止。";
const act="807a24b9-5380-41f0-96e2-b98636e0267e", menu="68381c6f-c841-46b9-bb39-0f0e9ff98722";
const skm=`https://culture.skm.com.tw/ActEvent/Cweb/ActiveContent?ActUUID=${act}&MenuUUID=${menu}`;
const skmIndex=(year=2027)=>`skm-article <a href="${skm}"><span>2026.09.01 - 2026.10.31</span><h2 class="skm-article__title">${year} 新光三越國際攝影大賽</h2></a>`;
const kmfa="https://awardkmfa.org.tw/announcements/Details/1";
const kmfaDetail=(body:string,title="《𝟐𝟎𝟐𝟕高雄獎》徵件開跑")=>`<h2 class="card-title">${title}</h2><div class="announce-content">${body}</div>`;

test("Taipei announcement separates three tracks, ignores festival dates and preserves paragraph boundaries",()=>{
 const rows=parseTaipeiCall(taipei,detail(`<h3>台灣電影行銷獎2月6日起徵件，3月20日截止</h3>${calls}`));
 assert.deepEqual(rows.map(r=>[r.externalId,r.opensOn,r.closesOn]),[["taipei-film-awards-2026","2026-02-06","2026-03-13"],["taipei-new-talent-2026","2026-02-06","2026-03-13"],["taipei-film-marketing-2026","2026-02-06","2026-03-20"]]);
});
test("Taipei malformed, conflicting and year-ambiguous dates are unconfirmed; ordinary result articles are excluded",()=>{
 for(const body of ["台北電影獎將於6月26日至7月11日舉行", "台北電影獎2月30日起徵件，3月20日截止", "台北電影獎2月6日起徵件，3月13日截止。台北電影獎2月6日起徵件，3月20日截止"]){assert.equal(parseTaipeiCall(taipei,detail(body))[0].closesOn,null);}
 assert.equal(parseTaipeiCall(taipei,detail(calls,undefined,"2025.12.06"))[0].closesOn,null);
 assert.equal(parseTaipeiCall(taipei,detail(calls,"2026台北電影獎徵件後入圍名單公布")).length,0);
 assert.throws(()=>parseTaipeiCall(taipei,"maintenance"));
});
test("Taipei queries use the public page token and discover future editions without a hardcoded detail URL",async()=>{
 const token=`function getNewsData() {let data={"${'a'.repeat(32)}":"${'b'.repeat(64)}"}}`;
 assert.equal(Object.keys(taipeiQueryToken(token)).length,1);assert.throws(()=>taipeiQueryToken("login"));
 const requests:string[]=[];
 const rows=await readTaipeiSource(async(url,signal,body)=>{requests.push(url);assert.ok(signal);if(url===taipeiNewsIndex)return token;if(body){assert.equal((body as {Amount:number}).Amount,30);return JSON.stringify({status:"success",totalNum:2,news:[{title:"2027台北電影節雙競賽徵件",uniqueUrl:taipei,public_time:"2027.02.01"},{title:"2027台北電影獎入圍名單",uniqueUrl:taipei,public_time:"2027.05.01"}]});}return detail(calls.replace("2026","2027"),"2027台北電影節雙競賽徵件","2027.02.01");},[],new Date("2027-02-06"));
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.externalId.endsWith("2027")));assert.equal(requests.filter(u=>u===taipei).length,1);
 await assert.rejects(readTaipeiSource(async()=>{throw Error("timeout");},[]),/timeout/);
 assert.throws(()=>parseTaipeiNews({status:"error",news:[],totalNum:0}));
});
test("source URL allowlists reject foreign hosts, credentialed URLs, non-HTTPS and unexpected paths",()=>{
 for(const url of ["https://evil.test/tw/news/abc","http://www.taipeiff.taipei/tw/news/abc","https://x@www.taipeiff.taipei/tw/news/abc"]){assert.equal(taipeiNewsUrl(url),null);}
 assert.equal(skmUrl(skm.replace("culture.skm.com.tw","evil.test")),null);assert.equal(skmUrl(skm.replace(act,"oops")),null);assert.equal(kmfaUrl("https://evil.test/announcements/Details/1"),null);
});
test("SKM derives edition from heading, not listing dates, and keeps sponsorship and contest separate",()=>{
 const rows=discoverSkm(skmIndex()+`<a href="${skm}"><h2 class="skm-article__title">2027 吳東興攝影贊助計畫</h2></a>`+skmIndex());
 assert.deepEqual(rows.map(r=>r.externalId),["skm-photo-contest-2027","skm-photo-sponsorship-2027"]);
 const r=parseSkmCall(rows[0],skm,'skm-article 新光三越攝影大賽 收件日期：2026/9/1~10/31');assert.equal(r.closesOn,"2026-10-31");assert.equal(r.externalId,"skm-photo-contest-2027");assert.equal(r.eligibility,undefined);
 assert.throws(()=>discoverSkm("maintenance"));
});
test("explicit submission labels support typography and shortened end years, not event dates",()=>{
 assert.deepEqual(labelledCallDates('徵件時間｜𝟐𝟎𝟐𝟔.𝟏𝟎.𝟏－𝟏𝟎.𝟑𝟏'),{opensOn:"2026-10-01",closesOn:"2026-10-31"});
 assert.equal(labelledCallDates("收件日期：2026/9/1－11/20止").closesOn,"2026-11-20");
 for(const body of ["展期：2026/9/1-10/31","收件日期：2026/2/30-3/31","收件日期：2026/9/1-10/31 收件日期：2026/9/1-11/20"]){assert.equal(labelledCallDates(body).closesOn,null);}
});
test("SKM discovery fetch failures reject the snapshot instead of returning partial data",async()=>{
 await assert.rejects(readSkmSource(async url=>{if(url.endsWith('.tw/'))return skmIndex();throw Error('network');}),/network/);
});
test("Kaohsiung Award handles Unicode years and explicit submission dates, excluding winners",()=>{
 assert.deepEqual(discoverKmfa(`<a href="${kmfa}">徵件</a><a href="${kmfa}">更多</a>`),[kmfa]);
 const row=parseKmfaCall(kmfa,kmfaDetail("徵件時間｜𝟐𝟎𝟐𝟔.𝟏𝟎.𝟏－𝟏𝟎.𝟑𝟏"));assert.equal(row?.externalId,"kaohsiung-award-2027");assert.equal(row?.closesOn,"2026-10-31");
 assert.equal(parseKmfaCall(kmfa,kmfaDetail("", "2027高雄獎徵件得獎名單")),null);
 assert.throws(()=>parseKmfaCall(kmfa,"maintenance"));
});
test("reviewed adoption matches official track plus year, not one shared URL",()=>{
 const a=reviewedCallIdentity("reviewed","taipei-film-awards-2026",taipei),b=reviewedCallIdentity("taipeiff","taipei-new-talent-2026",taipei);assert.notEqual(a,b);
 assert.equal(a,reviewedCallIdentity("taipeiff","taipei-film-awards-2026",taipei));
 assert.equal(reviewedCallIdentity("reviewed","kaohsiung-award-2027","https://awardkmfa.org.tw/"),reviewedCallIdentity("kmfa_award","kaohsiung-award-2027",kmfa));
 assert.equal(reviewedCallIdentity("reviewed","taipei-film-awards-2026","https://evil.test/tw/news/abc"),null);
});
