import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { parseMoc, parseGrantsGov, usDate, isoDate, listingHash } from "./domain";
import { grantAvailability } from "./availability";
import { grantsLocalEnabled } from "./config";

const moc=readFileSync(new URL("./fixtures/moc-news.html",import.meta.url),"utf8");
const us=JSON.parse(readFileSync(new URL("./fixtures/grants-gov.json",import.meta.url),"utf8"));
describe("official grant adapters",()=>{
  test("ROC application dates stay separate from the next fiscal year",()=>{
    const rows=parseMoc(moc); assert.equal(rows.length,5);
    assert.equal(rows[1].opensOn,"2026-10-08"); assert.equal(rows[1].closesOn,"2026-11-09");
    assert.equal(rows[2].closesOn,"2026-11-09"); assert.equal(rows[0].opensOn,"2026-10-12");
    assert.equal(grantAvailability(rows[0],"2026-10-11"),"upcoming");
    assert.equal(grantAvailability(rows[1],"2026-10-11"),"open");
    assert.equal(grantAvailability(rows[1],"2026-11-10"),"closed");
  });
  test("broken source structure and unexpected links fail instead of silently emptying the cache",()=>{
    assert.throws(()=>parseMoc("<html></html>"));
    assert.throws(()=>parseMoc(moc.replace('href="Normal.jsp','href="https://evil.example/Normal.jsp')));
  });
  test("markup is stripped and fiscal years do not become invented deadlines",()=>{
    const rows=parseMoc(moc.replaceAll("自115年10月8日起至115年11月9日止","<b>116年度</b>"));
    assert.equal(rows[1].opensOn,null);assert.equal(rows[1].closesOn,null);assert.ok(!rows[1].title.includes("<b>"));
  });
  test("link view-state rotation does not create a second opportunity",()=>{
    assert.equal(parseMoc(moc)[0].externalId,parseMoc(moc.replaceAll("eNFfQYZ","newState"))[0].externalId);
  });
  test("rotating view-state tokens does not issue false change reminders",()=>{
    const original=parseMoc(moc)[0]; const rotated=parseMoc(moc.replaceAll("eNFfQYZ","newState"))[0];
    assert.equal(listingHash(original),listingHash(rotated));
    assert.notEqual(listingHash(original),listingHash({...original,closesOn:"2026-12-01"}));
  });
  test("U.S. source preserves forecast status and unknown/placeholder dates",()=>{
    const parsed=parseGrantsGov(us);assert.equal(parsed.rows.length,22);
    assert.equal(parsed.rows[0].sourceStatus,"forecasted");assert.equal(parsed.rows[0].closesOn,null);
    assert.equal(parsed.rows[4].closesOn,null); assert.equal(usDate("02/30/2026"),null);assert.equal(isoDate(2026,2,29),null);
    assert.throws(()=>parseGrantsGov({errorcode:1,data:{oppHits:[]}}));
  });
  test("a listing no longer observed by the adapter becomes unconfirmed after a day",()=>{
    const g={sourceStatus:"posted" as const,opensOn:"2026-10-01",closesOn:"2026-11-09",checkedAt:new Date(Date.now()-2*24*60*60*1000).toISOString()};
    assert.equal(grantAvailability(g,"2026-10-11"),"check");
    assert.equal(grantAvailability(g,"2026-11-10"),"closed");
  });
  test("missing application dates require checking rather than declaring a grant open",()=>{
    assert.equal(grantAvailability({sourceStatus:"posted",opensOn:null,closesOn:null},"2026-10-11"),"check");
  });
});
describe("grant experiment isolation",()=>{
  test("only explicitly enabled development on a loopback database can run",()=>{
    const env={GRANTS_LOCAL_ENABLED:"1",APP_ENV:"development",DATABASE_URL:"postgres://local:local@localhost:54322/postgres"};
    assert.equal(grantsLocalEnabled(env),true);
    assert.equal(grantsLocalEnabled({...env,GRANTS_LOCAL_ENABLED:"0"}),false);
    assert.equal(grantsLocalEnabled({...env,DATABASE_URL:"postgres://local:local@remote.example/db"}),false);
    assert.equal(grantsLocalEnabled({...env,APP_ENV:"production"}),false);
    assert.equal(grantsLocalEnabled({...env,NODE_ENV:"production"}),false);
    assert.equal(grantsLocalEnabled({...env,DATABASE_URL:"invalid"}),false);
  });
});
