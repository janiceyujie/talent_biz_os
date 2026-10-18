import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalTemplateStore } from "./local-store";

test("template import refuses remote databases, remote buckets, and missing settings", () => {
  assert.doesNotThrow(() => assertLocalTemplateStore("postgresql://localhost:54322/postgres", "http://127.0.0.1:54321/storage/v1/s3"));
  for (const [db, files] of [
    ["postgresql://db.example.com/postgres", "http://localhost:54321"],
    ["postgres://localhost/postgres", "https://storage.example.com"],
    ["postgres://localhost.example.com/postgres", "http://localhost"],
    ["http://localhost", "http://localhost"],
    [undefined, undefined],
  ]) assert.throws(() => assertLocalTemplateStore(db, files), /requires a local/);
});
