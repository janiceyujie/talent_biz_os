import test from "node:test";
import assert from "node:assert/strict";
import {restrictedImport} from "./import-policy";
import {decide} from "./relevance/rules";
import {toMetadata} from "./gmail/parse";
test("work classification does not bypass payment or excluded-label import protection",()=>{
  const m=toMetadata({id:"mail",threadId:"thread",payload:{headers:[{name:"Subject",value:"Invoice for October"},{name:"From",value:"agent@example.invalid"}]}});
  assert.equal(decide(m,{contacts:new Set([m.from.address]),workThreads:new Set(),senderRules:[]}).outcome,"work");
  assert.equal(restrictedImport(m),true);
  assert.equal(restrictedImport({...m,subject:"Booking details"},"payment"),true);
  assert.equal(restrictedImport({...m,subject:"Booking details",labels:["TRASH"]}),true);
  assert.equal(restrictedImport({...m,subject:"Booking details",labels:[]}),false);
});
