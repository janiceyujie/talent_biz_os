// Opportunities (decision 0024): reading the sources, screening, and the list. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { availability, listParams, pageOf } from "./list";
import { screen } from "./screening";
import { parseDetail, parseSearch } from "./sources/grants-gov";
import { parseMoc } from "./sources/moc";
import type { Opportunity, OpportunityRules, ScreeningProfile } from "./types";

const apply = (point: string, form: string, start = "2026/10/01", end = "2026/11/02", unit = "文化部-藝術發展司") =>
  `<Apply><Year>115</Year><UnitName>${unit}</UnitName><PointName>${point}</PointName><FormName>${form}</FormName><StartDate>${start}</StartDate><EndDate>${end}</EndDate></Apply>`;
const xml = (...rows: string[]) => `<?xml version="1.0" encoding="UTF-8"?><database><dml>${rows.join("")}</dml></database>`;

describe("Ministry of Culture", () => {
  test("who a form is for comes from its own marker, not the program's name", () => {
    const rows = parseMoc(
      xml(
        apply("補助要點", "補助要點&#40;個人&#41;"),
        apply("補助要點", "補助要點_團體"),
        apply("文化團體及個人交流", "文化團體及個人交流_縣市政府"),
        apply("電影獎勵", "此為團體/公司行號申請之表單"),
        apply("視覺藝術類補助", "視覺藝術類補助"),
      ),
      "2026-10-01",
    );
    assert.deepEqual(
      rows.map((r) => r.rules?.applicantTypes ?? null),
      [["individual"], ["business", "nonprofit"], ["government"], ["business", "nonprofit"], null],
    );
    assert.equal(rows[0].title, "補助要點(個人)"); // entities decoded
    assert.equal(rows[3].title, "電影獎勵 — 此為團體/公司行號申請之表單");
    assert.equal(rows[4].title, "視覺藝術類補助");
    assert.equal(rows[4].rules, null); // nothing stated: no rules at all
  });

  test("a unit that funds one discipline says so; dates parse, and old rounds are left out", () => {
    const rows = parseMoc(
      xml(apply("流行音樂國際活動", "流行音樂國際活動_個人", "2026/01/01", "2026/12/31", "流行音樂產業組"), apply("去年的", "去年的", "2025/01/01", "2025/03/01")),
      "2026-09-21",
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].rules?.disciplines, ["music"]);
    assert.deepEqual([rows[0].opensOn, rows[0].closesOn, rows[0].region, rows[0].sourceStatus], ["2026-01-01", "2026-12-31", "TW", "posted"]);
  });

  test("each round is its own call, the same row twice is one, and a changed list fails loudly", () => {
    const rows = parseMoc(xml(apply("翻譯", "翻譯", "2026/03/01", "2026/12/01"), apply("翻譯", "翻譯", "2026/10/27", "2026/12/01"), apply("翻譯", "翻譯", "2026/10/27", "2026/12/01")), "2026-10-01");
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].externalId, rows[1].externalId);
    assert.throws(() => parseMoc("<html>maintenance</html>", "2026-10-01"), /moc_structure_changed/);
  });
});

describe("Grants.gov", () => {
  const hits = { errorcode: 0, data: { hitCount: 2, oppHits: [
    { id: "1", title: "Arts project", agency: "NEA", openDate: "10/01/2026", closeDate: "02/12/2027", oppStatus: "posted" },
    { id: 2, title: "Always open", openDate: "03/19/2026", closeDate: "01/01/2099", oppStatus: "posted" },
  ] } };
  const detail = (ids: string[], prose = "") => ({ errorcode: 0, data: { id: 1, synopsis: { applicantTypes: ids.map((id) => ({ id, description: `Code ${id}` })), applicantEligibilityDesc: prose } } });

  test("a search page parses; a far-off placeholder isn't a deadline", () => {
    const { rows, total } = parseSearch(hits);
    assert.equal(total, 2);
    assert.deepEqual([rows[0].opensOn, rows[0].closesOn], ["2026-10-01", "2027-02-12"]);
    assert.equal(rows[1].closesOn, null);
    assert.equal(rows[1].agency, "Grants.gov");
  });

  test("official codes set who can apply; prose, Others, or the wrong call leave it unknown", () => {
    assert.deepEqual(parseDetail(detail(["12", "13"]), "1")?.applicantTypes, ["nonprofit"]);
    assert.deepEqual(parseDetail(detail(["21"]), "1")?.applicantTypes, ["individual"]);
    assert.equal(parseDetail(detail(["99"]), "1")?.applicantTypes, "any");
    assert.equal(parseDetail(detail(["25"]), "1")?.applicantTypes, null);
    assert.equal(parseDetail(detail(["12"], "<p>Individuals may also apply</p>"), "1")?.applicantTypes, null);
    assert.match(parseDetail(detail(["12"], "<p>Individuals may also apply</p>"), "1")!.evidence, /Individuals may also apply/);
    assert.equal(parseDetail(detail(["12"]), "2"), null);
    assert.equal(parseDetail({ errorcode: 0, data: { id: 1 } }, "1"), null);
    assert.deepEqual(parseDetail(detail(["12", "00"]), "1"), parseDetail(detail(["00", "12"]), "1")); // the same each day, whatever the order

  });
});

const rules = (over: Partial<OpportunityRules> = {}): OpportunityRules => ({ applicantTypes: null, countries: null, areas: null, disciplines: null, evidence: "", ...over });
const profile = (over: Partial<ScreeningProfile> = {}): ScreeningProfile => ({ version: 1, applicantType: "individual", country: "TW", area: "TW-TPE", disciplines: ["music"], ...over });
const now = new Date("2026-10-22T04:00:00Z");
const fresh = "2026-10-21T21:00:00Z";

describe("screening", () => {
  test("every dimension stated and matching fits; one stated against you doesn't", () => {
    const all = rules({ applicantTypes: ["individual"], countries: ["TW"], areas: "any", disciplines: ["music", "film"] });
    assert.equal(screen(all, profile(), fresh, now).fit, "fits");
    assert.equal(screen({ ...all, applicantTypes: ["business", "nonprofit"] }, profile(), fresh, now).fit, "doesNotFit");
    assert.equal(screen({ ...all, areas: ["TW-KHH"] }, profile(), fresh, now).fit, "doesNotFit");
  });

  test("unknown, missing, and stale are Check, never Doesn't fit", () => {
    assert.equal(screen(null, profile(), fresh, now).fit, "check");
    assert.equal(screen(rules({ applicantTypes: ["individual"] }), profile(), fresh, now).fit, "check"); // the rest unknown
    const all = rules({ applicantTypes: ["individual"], countries: "any", areas: "any", disciplines: ["music"] });
    assert.equal(screen(all, profile({ disciplines: [] }), fresh, now).fit, "check");
    assert.equal(screen(all, null, fresh, now).fit, "check");
    const stale = screen(all, profile(), "2026-10-15T00:00:00Z", now);
    assert.deepEqual([stale.fit, stale.reasons], ["check", [{ kind: "stale" }]]);
  });

  test("a stated exclusion wins over an unknown", () => {
    assert.equal(screen(rules({ applicantTypes: ["government"] }), profile(), fresh, now).fit, "doesNotFit");
  });
});

describe("the list", () => {
  const call = (over: Partial<Opportunity>): Opportunity => ({
    id: "00000000-0000-0000-0000-000000000000", source: "moc", region: "TW", kind: "grant", title: "", agency: "", url: "https://grants.moc.gov.tw/Web/",
    opensOn: "2026-10-01", closesOn: "2026-11-30", sourceStatus: "posted", summary: "", rules: null, checkedAt: fresh, changedAt: fresh, ...over,
  });
  const rows = [
    call({ id: "a", title: "Later", closesOn: "2026-12-31" }),
    call({ id: "b", title: "Sooner", closesOn: "2026-10-30" }),
    call({ id: "c", title: "For groups", closesOn: "2026-10-25", rules: rules({ applicantTypes: ["business", "nonprofit"] }) }),
    call({ id: "d", title: "Coming", opensOn: "2026-12-01", closesOn: "2027-01-15" }),
    call({ id: "e", title: "Gone", closesOn: "2026-10-20" }),
    call({ id: "f", title: "US", region: "US", source: "grants_gov", sourceStatus: "forecasted", opensOn: null, closesOn: null }),
  ];
  const params = (over: Record<string, string> = {}) => listParams.parse({ region: "all", kind: "all", within: "", following: "", show: "fitting", q: "", cursor: "", ...over });
  const page = (over: Record<string, string> = {}, followed: string[] = []) =>
    pageOf(rows, params(over), { profile: profile(), talentZone: "America/New_York", followed: new Set(followed), now });

  test("open first, soonest to close first; closed and doesn't-fit left out", () => {
    assert.deepEqual(page().items.map((o) => o.id), ["b", "a", "d", "f"]);
    assert.deepEqual(page({ show: "all" }).items.map((o) => o.id), ["c", "b", "a", "d", "f"]);
  });

  test("filters: region, closing within, following (closed ones too), search", () => {
    assert.deepEqual(page({ region: "US" }).items.map((o) => o.id), ["f"]);
    assert.deepEqual(page({ within: "30" }).items.map((o) => o.id), ["b"]);
    assert.deepEqual(page({ following: "1" }, ["e", "a"]).items.map((o) => o.id), ["a", "e"]);
    assert.deepEqual(page({ q: "soon" }).items.map((o) => o.id), ["b"]);
  });

  test("a cursor picks up after the last row", () => {
    const first = page({ limit: "2" });
    assert.deepEqual([first.items.map((o) => o.id), first.total], [["b", "a"], 4]);
    assert.deepEqual(page({ limit: "2", cursor: first.nextCursor! }).items.map((o) => o.id), ["d", "f"]);
  });

  test("a call's state is read from its dates and what the source says", () => {
    assert.equal(availability(rows[0], "2026-10-22"), "open");
    assert.equal(availability(rows[3], "2026-10-22"), "upcoming");
    assert.equal(availability(rows[4], "2026-10-22"), "closed");
    assert.equal(availability({ opensOn: null, closesOn: null, sourceStatus: "unknown" }, "2026-10-22"), "unknown");
  });
});
