import assert from "node:assert/strict";
import {test} from "node:test";
import {managerCapability} from "./entitlement";
import {selectManagedArtists} from "./scope";
const now=new Date("2026-10-12T12:00:00Z"),row={plan:"manager",artistLimit:3,active:true,expiresAt:null};
test("Basic and regular Pro never gain a portfolio capability from the display toggle or role",()=>{
  for(const plan of ["basic","pro","unknown"])assert.deepEqual(managerCapability({...row,plan},now),{enabled:false,artistLimit:0});
  assert.equal(managerCapability(undefined,now).enabled,false);
});
test("only an active unexpired manager capability supplies the trusted seat limit",()=>{
  assert.deepEqual(managerCapability(row,now),{enabled:true,artistLimit:3});
  assert.deepEqual(managerCapability({...row,artistLimit:4},now),{enabled:true,artistLimit:4});
  for(const values of [{active:false},{expiresAt:now},{expiresAt:new Date("2026-10-11")},{artistLimit:0},{artistLimit:101},{artistLimit:3.5}])assert.equal(managerCapability({...row,...values},now).enabled,false);
});
test("four artists require four seats; downgrade cannot bypass the limit by selecting a subset",()=>{
  const artists=["A","B","C","D"].map(id=>({id,name:id,timeZone:"UTC",role:"manager",status:"active"}));
  assert.equal(selectManagedArtists(artists,undefined,4).length,4);
  assert.throws(()=>selectManagedArtists(artists,["A"],3));
  assert.throws(()=>selectManagedArtists(artists,["unknown"],4));
});
