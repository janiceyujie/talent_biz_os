import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceManifestInput, referenceRowInput, referenceStates } from "./reference-input";
const row = { state: "IL", code: "test", name: "Test jurisdiction", level: "combined", scope: "General merchandise", rate: null, sourceUrl: "https://tax.illinois.gov/research/taxrates/sales-tax-rate-machine-readable-files.html", validFrom: null, validThrough: null, dateBasis: "unknown", status: "pending", reasons: ["effectiveDate", "addressOverride"], notes: "" };
test("missing rate remains null; zero must be explicitly supplied", () => {
  assert.equal(referenceRowInput.parse(row).rate, null);
  assert.equal(referenceRowInput.parse({ ...row, rate: 0 }).rate, 0);
  for (const rate of ["", "0", -1, 101]) assert.equal(referenceRowInput.safeParse({ ...row, rate }).success, false);
  assert.equal(referenceRowInput.safeParse({ ...row, reasons: ["effectiveDate"] }).success, false);
});
test("unknown dates and unsafe provenance cannot be promoted", () => {
  assert.equal(referenceRowInput.safeParse({ ...row, reasons: ["addressOverride"] }).success, false);
  assert.equal(referenceRowInput.safeParse({ ...row, validFrom: "2026-12-01", validThrough: "2026-01-01" }).success, false);
  assert.equal(referenceRowInput.safeParse({ ...row, status: "reviewed" }).success, false);
  for (const sourceUrl of ["http://tax.illinois.gov/a", "https://tax.illinois.gov.example.com/a", "https://user:password@tax.illinois.gov/a"]) assert.equal(referenceRowInput.safeParse({ ...row, sourceUrl }).success, false);
});
test("complete reference manifests require provenance, coverage and unique revisions", () => {
  const url = row.sourceUrl;
  const manifest = { version: 1, parserVersion: "official-reference-2026-10-v1", states: referenceStates.map(state => ({ state, url, localUrl: url })), documents: [{ status: "pending", url, retrievedAt: "2026-10-17T12:00:00Z", error: "unavailable" }], rows: referenceStates.flatMap(state => ["state", "localSummary"].map(level => ({ ...row, state, level, code: level, reasons: ["effectiveDate", "sourceUnavailable"] }))) };
  assert.equal(referenceManifestInput.safeParse(manifest).success, true);
  assert.equal(referenceManifestInput.safeParse({ ...manifest, documents: [] }).success, false);
  assert.equal(referenceManifestInput.safeParse({ ...manifest, states: manifest.states.slice(1) }).success, false);
  assert.equal(referenceManifestInput.safeParse({ ...manifest, rows: [...manifest.rows, manifest.rows[0]] }).success, false);
});
