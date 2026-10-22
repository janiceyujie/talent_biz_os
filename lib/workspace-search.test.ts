// The ⌘K search's ranking and remembered picks. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readSearchHistory, searchWorkspace, type SearchItem } from "./workspace-search";

const item = (id: string, label: string, detail = ""): SearchItem => ({ id, label, detail, href: "/projects", kind: "project" });

describe("searchWorkspace", () => {
  test("the exact name first, then names starting with it, containing it, then a match in the details", () => {
    const items = [item("detail", "City show", "Alex"), item("contains", "Meet Alex"), item("prefix", "Alex tour"), item("exact", "Alex")];
    assert.deepEqual(searchWorkspace(items, "  ＡＬＥＸ  ").map((x) => x.id), ["exact", "prefix", "contains", "detail"]);
    assert.equal(searchWorkspace(items, "unknown").length, 0);
  });
  test("one Chinese character matches; every word typed must match somewhere", () => {
    const items = [item("a", "品牌拍攝", "晨光工作室"), item("b", "音樂演出", "品牌公司")];
    assert.deepEqual(searchWorkspace(items, "品").map((x) => x.id), ["a", "b"]);
    assert.deepEqual(searchWorkspace(items, "拍攝 晨光").map((x) => x.id), ["a"]);
    assert.equal(searchWorkspace(items, "拍攝 音樂").length, 0);
  });
  test("with nothing typed: five suggestions, recent picks still in the workspace first", () => {
    const items = Array.from({ length: 100 }, (_, i) => item(String(i), `Project ${i}`));
    assert.deepEqual(searchWorkspace(items, "", ["removed", "8", "8", "4"]).map((x) => x.id), ["8", "4", "0", "1", "2"]);
    assert.deepEqual(searchWorkspace([], "", ["8"]), []);
  });
});

describe("readSearchHistory", () => {
  test("unreadable storage is no history; only short string ids are kept, once each, at most 20", () => {
    for (const raw of [null, "bad json", "{}", "null"]) assert.deepEqual(readSearchHistory(raw), []);
    assert.deepEqual(readSearchHistory('["a",4,"a",null,"b"]'), ["a", "b"]);
    assert.equal(readSearchHistory(JSON.stringify(Array.from({ length: 50 }, (_, i) => String(i)))).length, 20);
  });
});
