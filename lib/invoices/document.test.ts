import test from "node:test";
import assert from "node:assert/strict";
import { billingDocumentKind, defaultDocumentKind, taiwanEinvoiceCapability } from "./document";

test("legacy documents retain their type; neither language nor delivery grants official issuance", () => {
  assert.equal(billingDocumentKind({}), "commercial_invoice");
  assert.equal(billingDocumentKind({documentKind:"tw_payment_request"}), "tw_payment_request");
  assert.equal(defaultDocumentKind("TWD"), "tw_payment_request");
  assert.equal(defaultDocumentKind("USD"), "commercial_invoice");
  assert.equal(taiwanEinvoiceCapability.available, false);
});
