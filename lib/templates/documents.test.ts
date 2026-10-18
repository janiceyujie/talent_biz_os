import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { documentScenarios,documentContent,documentFilename } from "./documents";

test("every localized contract and quote has real Word bytes and usable content",()=>{
  const paths=new Set<string>();
  for(const s of documentScenarios)for(const kind of ["contract","quote"] as const)for(const locale of ["en","zh-TW"] as const){
    const path=documentFilename(s.id,kind,locale);
    assert.ok(!paths.has(path));paths.add(path);
    const bytes=readFileSync(`assets/document-templates/${path}`);
    assert.equal(bytes.subarray(0,2).toString(),"PK");
    const doc=documentContent(s.id,kind,locale);
    assert.ok(doc.sections.length>=6);
    assert.ok(doc.text.includes(locale==="en"?"[":"［"));
  }
  assert.equal(paths.size,documentScenarios.length * 4);
});
