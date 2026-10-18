import { test } from "node:test";
import assert from "node:assert/strict";
import { appendPage, LIST_PAGE_SIZE } from "./cursor-page";
test("an updated row crossing a page boundary replaces its value without duplication", () => {
  assert.deepEqual(appendPage([{ id: "a", title: "old" }, { id: "b", title: "B" }], [{ id: "a", title: "updated" }, { id: "c", title: "C" }]), [{ id: "a", title: "updated" }, { id: "b", title: "B" }, { id: "c", title: "C" }]);
  assert.equal(LIST_PAGE_SIZE, 20);
});
