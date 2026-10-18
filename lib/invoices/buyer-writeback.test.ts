import test from "node:test";
import assert from "node:assert/strict";
import {buyerWritebackInput, buyerBillingFields} from "./buyer-writeback";
const base = {kind: "contact", id: "12345678-1234-4234-8234-123456789abc", op: "save", confirmed: true,
  expected: {address: "", email: ""}, patch: {address: "New address"}};
test("buyer writeback permits only selected, nonblank billing fields", () => {
  assert.equal(buyerWritebackInput.safeParse(base).success, true);
  for (const patch of [{}, {address: " "}, {email: "bad"}, {address: "x".repeat(601)}, {name: "New name"}]) {
    assert.equal(buyerBillingFields.safeParse(patch).success, false);
  }
  assert.deepEqual(buyerBillingFields.parse({address: "  New address  "}), {address: "New address"});
});
test("buyer writeback requires confirmation, stable identity and the reviewed baseline", () => {
  for (const change of [{confirmed: false}, {id: "Example Partner"}, {kind: "invoice"}, {expected: undefined}, {talentId: "other"}]) {
    assert.equal(buyerWritebackInput.safeParse({...base, ...change}).success, false);
  }
});
