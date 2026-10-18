import test from "node:test";
import assert from "node:assert/strict";
import { phaseOf, isSigned } from "./phases";

test("completion ends the workflow without losing signed-work history", () => {
  assert.equal(phaseOf("closed"),"ended");
  assert.equal(phaseOf("collecting_payment"),"settlement");
  assert.ok(isSigned("closed"));
  assert.equal(isSigned("cancelled"),false);
  assert.equal(isSigned("declined"),false);
});
