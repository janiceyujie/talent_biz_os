// Near-duplicate organisations (decision 0012). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Contact, Organization } from "@/lib/types";
import { duplicateSuggestions, normalizeOrgName, pairKey } from "./organizations";

const org = (id: string, name: string, over: Partial<Organization> = {}): Organization => ({ id, name, notes: "", archived: false, ...over });
const person = (organizationId: string, email: string): Contact => ({
  id: `${organizationId}-${email}`,
  role: "counterparty",
  name: email,
  company: "",
  email,
  phone: "",
  notes: "",
  archived: false,
  organizationId,
});
const pairs = (orgs: Organization[], contacts: Contact[] = [], distinct = new Set<string>()) =>
  duplicateSuggestions(orgs, contacts, distinct).map((s) => `${s.a.name} ~ ${s.b.name} (${s.reason}${s.strong ? ", strong" : ""})`);

describe("normalizeOrgName", () => {
  test("drops legal suffixes, in Chinese and English", () => {
    assert.equal(normalizeOrgName("春浪國際股份有限公司"), "春浪國際");
    assert.equal(normalizeOrgName("春浪國際有限公司"), "春浪國際");
    assert.equal(normalizeOrgName("Universal Music Taiwan Co., Ltd."), "universalmusictaiwan");
    assert.equal(normalizeOrgName("Blue Room Inc"), "blueroom");
  });
  test("ignores width, case, spacing, and punctuation", () => {
    assert.equal(normalizeOrgName("ＢＬＵＥ　ＲＯＯＭ"), "blueroom");
    assert.equal(normalizeOrgName("  Blue-Room! "), "blueroom");
  });
  test("keeps a name that is only a suffix word inside a word", () => {
    assert.equal(normalizeOrgName("Costco"), "costco");
  });
});

describe("duplicateSuggestions", () => {
  test("the same name once the legal suffix is gone is a strong match", () => {
    assert.deepEqual(pairs([org("1", "春浪國際"), org("2", "春浪國際股份有限公司")]), ["春浪國際 ~ 春浪國際股份有限公司 (sameName, strong)"]);
  });
  test("people sharing a company email domain make a strong match, free mail doesn't", () => {
    const orgs = [org("1", "Spring Wave"), org("2", "春浪國際")];
    assert.deepEqual(pairs(orgs, [person("1", "a@spring.example"), person("2", "b@spring.example")]), ["Spring Wave ~ 春浪國際 (sharedDomain, strong)"]);
    assert.deepEqual(pairs(orgs, [person("1", "a@gmail.com"), person("2", "b@gmail.com")]), []);
  });
  test("one name inside the other is a possible match, but not for very short names", () => {
    assert.deepEqual(pairs([org("1", "春浪"), org("2", "春浪音樂祭")]), []);
    assert.deepEqual(pairs([org("1", "春浪音樂"), org("2", "春浪音樂祭執行委員會")]), ["春浪音樂 ~ 春浪音樂祭執行委員會 (contains)"]);
  });
  test("names that differ only by a number aren't suggested", () => {
    assert.deepEqual(pairs([org("1", "測試公司 1"), org("2", "測試公司 10"), org("3", "Studio 2"), org("4", "Studio 21")]), []);
  });
  test("a Latin name a letter off is a possible match", () => {
    assert.deepEqual(pairs([org("1", "Universal Music"), org("2", "Universal Musik")]), ["Universal Music ~ Universal Musik (spelling)"]);
    assert.deepEqual(pairs([org("1", "Nike"), org("2", "Mike")]), []);
  });
  test("pairs marked as different, and archived organisations, aren't suggested", () => {
    const orgs = [org("1", "春浪國際"), org("2", "春浪國際股份有限公司")];
    assert.deepEqual(pairs(orgs, [], new Set([pairKey("2", "1")])), []);
    assert.deepEqual(pairs([org("1", "春浪國際"), org("2", "春浪國際有限公司", { archived: true })]), []);
  });
  test("different organisations aren't suggested", () => {
    assert.deepEqual(pairs([org("1", "Warner Music Taiwan"), org("2", "Universal Music Taiwan"), org("3", "Adidas Taiwan")]), []);
  });
});
