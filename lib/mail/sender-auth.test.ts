// Gmail's sender checks (decision 0013). Made-up headers. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { senderCheck } from "./sender-auth";

const gmail = (rest: string) => `mx.google.com; ${rest}`;

test("DMARC decides when it's there", () => {
  assert.equal(senderCheck([gmail("dkim=pass header.i=@agency.example; spf=pass smtp.mailfrom=agency.example; dmarc=pass (p=REJECT) header.from=agency.example")]), "verified");
  assert.equal(senderCheck([gmail("dkim=none; spf=pass; dmarc=fail (p=NONE) header.from=bank.example")]), "failed");
});

test("without DMARC, both SPF and DKIM must fail", () => {
  assert.equal(senderCheck([gmail("dkim=fail; spf=softfail")]), "failed");
  assert.equal(senderCheck([gmail("dkim=fail; spf=pass")]), "unknown");
  assert.equal(senderCheck([gmail("spf=none")]), "unknown");
});

test("only Gmail's own topmost header counts, and none means unknown", () => {
  assert.equal(senderCheck([gmail("dmarc=fail"), gmail("dmarc=pass")]), "failed", "a forged one lower down is ignored");
  assert.equal(senderCheck(["evil.example; dmarc=pass", gmail("dmarc=pass")]), "unknown");
  assert.equal(senderCheck([]), "unknown");
});
