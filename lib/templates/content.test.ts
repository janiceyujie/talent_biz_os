// The contract and quote templates' content (decision 0020). Run: npm test
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { locales } from "../i18n/config";
import { contentHash, templateContent, templateKinds, templateText, type TemplateContent } from "./content";
import { generateDocx } from "./docx";

const dir = join(process.cwd(), "assets/document-templates/content");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const all = files.map((f) => ({ file: f, content: templateContent.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))) }));

describe("the content files", () => {
  test("every one is valid, and named for its scenario, kind, and language", () => {
    assert.ok(all.length > 0);
    for (const { file, content } of all) assert.equal(file, `${content.scenario}-${content.kind}-${content.locale}.json`);
  });
  test("every scenario has a contract and a quote in every language, written for one role", () => {
    const scenarios = new Set(all.map((a) => a.content.scenario));
    for (const s of scenarios) {
      const of = all.filter((a) => a.content.scenario === s);
      assert.equal(of.length, templateKinds.length * locales.length, s);
      assert.equal(new Set(of.map((a) => a.content.role)).size, 1, `${s}: one role`);
    }
  });
});

const sample: TemplateContent = {
  scenario: "live",
  role: "musician",
  kind: "quote",
  locale: "en",
  title: "Live performance quote",
  blocks: [
    { type: "heading", text: "Fees" },
    { type: "numbered", items: ["Fee [amount]", "Deposit [amount]"] },
    { type: "table", columns: ["Item", "Amount"], rows: [["Performance", "[___]"]] },
  ],
};

describe("templateText", () => {
  test("numbers each list from 1 and tabs a table's columns, for pasting", () => {
    assert.equal(templateText(sample), "Live performance quote\n\nFees\n\n1. Fee [amount]\n2. Deposit [amount]\n\nItem\tAmount\nPerformance\t[___]");
  });
});

describe("contentHash", () => {
  test("the same content and note give the same hash; a change to either gives another", () => {
    const a = contentHash(sample, "Not legal advice.");
    assert.equal(contentHash(structuredClone(sample), "Not legal advice."), a);
    assert.notEqual(contentHash({ ...sample, title: "Changed" }, "Not legal advice."), a);
    assert.notEqual(contentHash(sample, "Changed note."), a);
  });
});

describe("generateDocx", () => {
  test("every content file makes a Word file", async () => {
    for (const { file, content } of all) {
      const bytes = await generateDocx(content, "Not legal advice.");
      assert.equal(bytes.subarray(0, 2).toString(), "PK", file); // a .docx is a zip
    }
  });
});
