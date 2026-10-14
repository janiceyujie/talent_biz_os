import assert from "node:assert/strict";
import { test } from "node:test";
import { readSearchHistory, searchWorkspace, type SearchItem } from "./workspace-search";
const item = (id: string, label: string, detail = ""): SearchItem => ({ id, label, detail, href: "/projects", kind: "project" });

test("autocomplete prioritizes exact names, prefixes, contained names, then metadata", () => {
  const items = [item("meta", "City show", "Alex"), item("contains", "Meet Alex"), item("prefix", "Alex tour"), item("exact", "Alex")];
  assert.deepEqual(searchWorkspace(items, "  ＡＬＥＸ  ").map(x => x.id), ["exact", "prefix", "contains", "meta"]);
  assert.equal(searchWorkspace(items, "unknown").length, 0);
});
test("single Chinese characters and multiple terms match names and partners", () => {
  const items = [item("a", "品牌拍攝", "晨光工作室"), item("b", "音樂演出", "品牌公司")];
  assert.deepEqual(searchWorkspace(items, "品").map(x => x.id), ["a", "b"]);
  assert.deepEqual(searchWorkspace(items, "拍攝 晨光").map(x => x.id), ["a"]);
  assert.equal(searchWorkspace(items, "拍攝 音樂").length, 0);
});
test("suggestions contain at most five distinct current items with recent picks first", () => {
  const items = Array.from({ length: 100 }, (_, i) => item(String(i), `Project ${i}`));
  assert.deepEqual(searchWorkspace(items, "", ["removed", "8", "8", "4"]).map(x => x.id), ["8", "4", "0", "1", "2"]);
  assert.deepEqual(searchWorkspace([], "", ["8"]), []);
  assert.equal(searchWorkspace([items[0]], "").length, 1);
});
test("history tolerates corrupt or unavailable storage and accepts bounded IDs only", () => {
  for (const value of [null, "bad json", "{}", "null"]) assert.deepEqual(readSearchHistory(value), []);
  assert.deepEqual(readSearchHistory('["a",4,"a",null,"b"]'), ["a", "b"]);
  assert.equal(readSearchHistory(JSON.stringify(Array.from({ length: 50 }, (_, i) => String(i)))).length, 20);
});
