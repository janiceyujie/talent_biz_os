import test from "node:test";
import assert from "node:assert/strict";
import { defaultTaiwanSetup, taiwanReadiness, taiwanSetupInput } from "./taiwan-setup";

test("TWD, self-declared registration or number tracks never enable official issuance", () => {
 assert.deepEqual(taiwanReadiness(defaultTaiwanSetup),{available:false,pending:["business","route","tracks","connection"]});
 for(const route of ["provider","turnkey"] as const) {
  const setup={...defaultTaiwanSetup,registered:true,businessName:"Synthetic studio",taxId:"12345675",route,providerName:"Any provider",numberTracksReady:true};
  assert.equal(taiwanSetupInput.safeParse(setup).success,true);
  assert.deepEqual(taiwanReadiness(setup),{available:false,pending:["connection"]});
 }
});
test("setup cannot smuggle credentials, live mode or an issued status", () => {
 for(const patch of [{apiKey:"secret"},{available:true},{mode:"live"},{status:"issued"},{registered:true},{taxId:"123"},{route:"ecpay"}]) {
  assert.equal(taiwanSetupInput.safeParse({...defaultTaiwanSetup,...patch}).success,false);
 }
});
