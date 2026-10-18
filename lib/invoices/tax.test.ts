import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../domain/money";
import { invoiceTaxInput, sameTaxBasis, taxRateInput, usStates } from "./tax";

test("combined rates retain four decimal places and round only the final cents", () => {
  assert.deepEqual(quote(1000, 8.875, false, "USD"), { net: 1000, tax: 88.75, total: 1088.75 });
  assert.deepEqual(quote(1088.75, 8.875, true, "USD"), { net: 1000, tax: 88.75, total: 1088.75 });
  assert.deepEqual(quote(1000, 8.1234, false, "USD"), { net: 1000, tax: 81.23, total: 1081.23 });
  assert.deepEqual(quote(1, 0.5, false, "USD"), { net: 1, tax: 0.01, total: 1.01 });
  assert.deepEqual(quote(0.01, 50, false, "USD"), { net: 0.01, tax: 0.01, total: 0.02 });
  assert.deepEqual(quote(1000, 5, false, "TWD"), { net: 1000, tax: 50, total: 1050 });
  assert.deepEqual(quote(100, 8.875, false, "JPY"), { net: 100, tax: 9, total: 109 });
  for (const rate of [0, 8.875, 8.1234, 100]) assert.ok(taxRateInput.safeParse(rate).success);
  for (const rate of [-1, 100.01, 8.12345, Infinity, NaN]) assert.equal(taxRateInput.safeParse(rate).success, false);
});
const review = { country: "US", state: "NY", location: "Synthetic service location", treatment: "taxable", rate: 8.875, included: false, source: "Synthetic QA, not a tax determination" };
test("a state is not a rate or exemption decision", () => {
  assert.equal(usStates.length, 51);
  assert.ok(invoiceTaxInput.safeParse(review).success);
  for (const change of [{state:"XX"}, {country:"CA"}, {location:" "}, {source:""}, {treatment:""}, {treatment:"exempt"}, {rate:8.12345}, {method:"automatic"}])
    assert.equal(invoiceTaxInput.safeParse({...review,...change}).success, false);
  for (const treatment of ["nonTaxable", "exempt", "notRequired"])
    assert.ok(invoiceTaxInput.safeParse({...review, treatment, rate:0}).success);
});
test("editing tax cannot silently overwrite a changed receivable", () => {
  const basis = {amount:1000, taxRate:8.875, taxIncluded:false};
  assert.ok(sameTaxBasis(basis, {...basis}));
  for (const change of [{amount:1001}, {taxRate:8.88}, {taxIncluded:true}]) assert.equal(sameTaxBasis(basis, {...basis,...change}), false);
});
