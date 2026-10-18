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

test("completed projects leave settlement; archiving and reopening remain separate", () => {
  const project={...data.projects[0],id:"completed",stage:"closed" as const,archived:false};
  const sample={...data,projects:[project]};
  let page=previewProjectPage(sample,{...params,view:"ended"});
  assert.equal(page.items[0].id,project.id);assert.equal(page.counts.settlement,0);assert.equal(page.counts.ended,1);assert.equal(page.counts.all,1);
  page=previewProjectPage({...sample,projects:[{...project,archived:true}]},{...params,view:"archived"});
  assert.equal(page.total,1);assert.equal(page.counts.ended,0);assert.equal(page.counts.all,0);
  page=previewProjectPage({...sample,projects:[{...project,stage:"collecting_payment"}]},{...params,view:"settlement"});
  assert.equal(page.total,1);assert.equal(page.counts.ended,0);
});
