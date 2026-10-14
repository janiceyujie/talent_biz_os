import test from "node:test";
import assert from "node:assert/strict";
import { previewProjectPage } from "./preview-projects";
import { workspaceSamples } from "@/lib/ai/workspace-samples";
import type { AppData } from "@/lib/types";

const data = workspaceSamples({} as AppData);
const params = { view: "all", type: "all", contact: "", q: "", sort: "amount" } as const;
test("preview list keeps samples visible after paginated-project integration", () => {
  const all = previewProjectPage(data, params);
  assert.equal(all.total, 5);
  assert.equal(all.items[0].id, "film");
  assert.equal(all.counts.negotiation, 1);
  assert.equal(previewProjectPage(data, { ...params, view: "negotiation" }).items[0].id, "show");
  assert.equal(previewProjectPage(data, { ...params, q: "headphone" }).total, 1);
  assert.equal(previewProjectPage(data, { ...params, view: "archived" }).total, 0);
});
