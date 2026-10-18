import assert from "node:assert/strict";
import {test} from "node:test";
import {managerCapability} from "./entitlement";
import {selectManagedArtists} from "./scope";
import {restorePortfolioSelection} from "./selection";
import {DEFAULT_MANAGED_ARTISTS,SUPPORTED_MANAGED_ARTISTS} from "./limits";
const row=(i:number)=>({id:`artist-${i}`,name:`Artist ${i}`,timeZone:"UTC",role:"manager",status:"active"});
test("one, two and three connected artists work without filling the launch allowance",()=>{
 assert.equal(DEFAULT_MANAGED_ARTISTS,3);
 for(const n of [1,2,3]) {const artists=Array.from({length:n},(_,i)=>row(i));assert.equal(selectManagedArtists(artists).length,n);}
});
test("explicit trusted allowances support 10, 20 and 30 artists without broadening a selection",()=>{
 for(const limit of [10,20,30]) {
  const capability=managerCapability({plan:"manager",artistLimit:limit,active:true,expiresAt:null});
  assert.equal(capability.artistLimit,limit);
  const artists=Array.from({length:limit},(_,i)=>row(i));
  assert.equal(selectManagedArtists(artists,undefined,limit).length,limit);
  assert.deepEqual(selectManagedArtists(artists,["artist-0","artist-2","artist-0"],limit).map(a=>a.id),["artist-0","artist-2"]);
  assert.throws(()=>selectManagedArtists(artists,["foreign"],limit));
  assert.throws(()=>selectManagedArtists([...artists,row(limit)],[],limit));
 }
});
test("unsupported capacity cannot authorize data through either the plan or scope layer",()=>{
 assert.equal(SUPPORTED_MANAGED_ARTISTS,30);
 for(const limit of [0,-1,31,100,1.2,NaN,Infinity]) {
  assert.equal(managerCapability({plan:"manager",artistLimit:limit,active:true,expiresAt:null}).enabled,false);
  assert.throws(()=>selectManagedArtists([],[],limit));
 }
});
test("a revoked artist or downgraded allowance cannot survive a saved picker selection",()=>{
 const artists=[row(0),row(1),row(2)];
 assert.deepEqual(restorePortfolioSelection(["artist-0","artist-1"],[artists[0]],3),["artist-0"]);
 assert.deepEqual(restorePortfolioSelection(["artist-0"],artists,2),[]);
 assert.deepEqual(restorePortfolioSelection(["artist-0"],[{...artists[0],status:"revoked"}],3),[]);
 assert.deepEqual(restorePortfolioSelection([],artists,3),[]);
});
