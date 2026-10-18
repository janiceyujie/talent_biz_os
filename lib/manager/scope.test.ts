import assert from "node:assert/strict";
import {test} from "node:test";
import {managedArtists,selectManagedArtists,managerDateRange,ManagerScopeError,type ArtistAccess} from "./scope";
import {managerLocalEnabled} from "./config";
const row=(id:string,values:Partial<ArtistAccess>={}):ArtistAccess=>({id,name:id,timeZone:"Asia/Taipei",role:"manager",status:"active",...values});
test("manager authorization excludes pending, revoked and owner-only workspaces",()=>{
  const rows=[row("A"),row("B"),row("C"),row("D",{status:"invited"}),row("E",{status:"revoked"}),row("F",{role:"owner"})];
  assert.deepEqual(managedArtists(rows).map(row=>row.id),["A","B","C"]);
  for(const id of ["D","E","F","unknown"])assert.throws(()=>selectManagedArtists(rows,[id]),ManagerScopeError);
});
test("all seven nonempty artist combinations and an empty selection retain exact scopes",()=>{
  const rows=[row("A"),row("B"),row("C")];
  for(let bits=0;bits<8;bits++){const ids=rows.filter((_,i)=>bits&(1<<i)).map(row=>row.id);assert.deepEqual(selectManagedArtists(rows,ids).map(row=>row.id),ids);}
  assert.deepEqual(selectManagedArtists(rows).map(row=>row.id),["A","B","C"]);
  assert.throws(()=>selectManagedArtists([...rows,row("D")]),ManagerScopeError);
  assert.equal(selectManagedArtists(rows,["A","A"]).length,1);
});
test("manager dates reject impossible dates, reversed and oversized ranges",()=>{
  assert.deepEqual(managerDateRange("2026-10-01","2026-12-31"),{start:"2026-10-01",end:"2026-12-31"});
  for(const [start,end] of [["2026-02-30","2026-03-01"],["2026-10-02","2026-10-01"],["2026-01-01","2026-12-31"]])assert.throws(()=>managerDateRange(start,end),ManagerScopeError);
});
test("manager pilot cannot be enabled in production or on a remote database",()=>{
  const env={APP_ENV:"development",NODE_ENV:"development",MANAGER_LOCAL_ENABLED:"1",DATABASE_URL:"postgres://localhost/db"};
  assert.equal(managerLocalEnabled(env),true);for(const change of [{NODE_ENV:"production"},{APP_ENV:"production"},{DATABASE_URL:"postgres://remote.example/db"},{MANAGER_LOCAL_ENABLED:"0"}])assert.equal(managerLocalEnabled({...env,...change}),false);
});
