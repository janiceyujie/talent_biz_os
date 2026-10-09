import { test } from "node:test";
import assert from "node:assert/strict";
import { runWorkspaceMutation } from "./preview";

test("preview never invokes persistence, including actions with no record ID", async () => {
  let calls=0;
  const action=async()=>{calls++;return null;};
  assert.equal(await runWorkspaceMutation(true,action,"read only"),"read only");
  assert.equal(calls,0);
  assert.equal(await runWorkspaceMutation(false,action,"read only"),null);
  assert.equal(calls,1);
});
