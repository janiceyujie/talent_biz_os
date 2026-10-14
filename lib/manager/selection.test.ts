import assert from "node:assert/strict";
import {test} from "node:test";
import {portfolioLink,restorePortfolioSelection} from "./selection";
const artists=["A","B","C"].map(id=>({id,name:id,timeZone:"UTC",role:"manager",status:"active"}));
test("restoring a selection preserves none and does not substitute all after revocation",()=>{
  assert.equal(restorePortfolioSelection(null,artists),null);
  assert.deepEqual(restorePortfolioSelection([],artists),[]);
  assert.deepEqual(restorePortfolioSelection(["A","A","revoked"],artists),["A"]);
  assert.deepEqual(restorePortfolioSelection(["revoked"],artists),[]);
  assert.equal(restorePortfolioSelection({ids:["A"]},artists),null);
});
test("portfolio links retain the selected artists and page-specific date without contaminating other pages",()=>{
  const url=new URL(portfolioLink("/calendar?date=2026-10-19&artist=old",["A","C"]),"http://localhost");
  assert.equal(url.searchParams.get("date"),"2026-10-19");
  assert.deepEqual(url.searchParams.getAll("artist"),["A","C"]);
  assert.equal(url.searchParams.get("portfolio"),"1");
  assert.equal(new URL(portfolioLink("/finance",[]),"http://localhost").searchParams.get("artist"),"none");
  assert.equal(new URL(portfolioLink("/projects?id=P",["A"]),"http://localhost").searchParams.get("id"),"P");
  assert.equal(portfolioLink("/inbox",["A"]),"/inbox");
  assert.equal(portfolioLink("/assistant",["A"]),"/assistant");
  assert.equal(portfolioLink("/calendar?date=2026-10-19",null),"/calendar?date=2026-10-19");
});
