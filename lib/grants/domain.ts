import { decodeSourceText } from "@/lib/text/entities";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { GrantListing } from "./types";

export function isoDate(year: number, month: number, day: number): string | null {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return z.iso.date().safeParse(value).success ? value : null;
}
export function usDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  // Grants.gov uses distant dates for continuously open programs. Do not invent a deadline from those.
  return m && Number(m[3]) < 2090 ? isoDate(Number(m[3]), Number(m[1]), Number(m[2])) : null;
}
export const grantPlainText = (s: string) => decodeSourceText(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const plain = grantPlainText;

/** A narrow adapter for the official home page's latest-news block. Missing structure fails visibly. */
export function parseMoc(html: string): GrantListing[] {
  const start = html.indexOf('newsSlide arrowOut');
  const end = html.indexOf('<!-- /news -->', start);
  if (start < 0 || end < 0) throw new Error("moc_structure_changed");
  const rows: GrantListing[] = [];
  const section = html.slice(start, end);
  for (const m of section.matchAll(/<time[^>]*>([^<]*)<\/time>\s*<p[^>]*>(.*?)<\/p>[\s\S]*?href="([^"]*Normal\.jsp[^"]*)"/g)) {
    const title = plain(m[2]);
    const url = new URL(plain(m[3]), "https://grants.moc.gov.tw/Web/");
    if (url.origin !== "https://grants.moc.gov.tw") throw new Error("moc_invalid_link");
    // Match only an explicit application period. Never infer a deadline from its fiscal year.
    const range = /自(\d{2,3})年(\d{1,2})月(\d{1,2})日(?:起)?至(?:(\d{2,3})年)?(\d{1,2})月(\d{1,2})日/.exec(title);
    const opensOn = range ? isoDate(Number(range[1]) + 1911, Number(range[2]), Number(range[3])) : null;
    const closesOn = range ? isoDate(Number(range[4] || range[1]) + 1911, Number(range[5]), Number(range[6])) : null;
    const identity = title.split(/[，,]|自\d{2,3}年/)[0].trim();
    rows.push({source:"moc", externalId:createHash("sha256").update(identity).digest("hex").slice(0,32), region:"TW", title:identity.slice(0,300), agency:"Ministry of Culture, Taiwan", url:url.href, opensOn, closesOn, sourceStatus:range ? "posted" : "unknown", summary:title.slice(0,1000)});
  }
  if (!rows.length) throw new Error("moc_empty_news");
  return rows;
}
const hit = z.object({id:z.union([z.string(),z.number()]), title:z.string().min(1).max(500), agency:z.string().optional(), agencyName:z.string().optional(), openDate:z.string().default(""), closeDate:z.string().default(""), oppStatus:z.string()});
export function parseGrantsGov(value: unknown): {rows: GrantListing[]; total: number} {
  const body = z.object({errorcode:z.literal(0), data:z.object({hitCount:z.number().int().nonnegative(), oppHits:z.array(hit).max(100)})}).parse(value);
  return {total:body.data.hitCount, rows:body.data.oppHits.map(r => ({source:"grants_gov", externalId:String(r.id), region:"US", title:plain(r.title).slice(0,300), agency:plain(r.agency || r.agencyName || "Grants.gov"), url:`https://www.grants.gov/search-results-detail/${encodeURIComponent(r.id)}`, opensOn:usDate(r.openDate), closesOn:usDate(r.closeDate), sourceStatus:r.oppStatus === "forecasted" ? "forecasted" : r.oppStatus === "posted" ? "posted" : "unknown", summary:""}))};
}
export const listingHash = (g: GrantListing) => {
  // MOC rotates opaque view-state links; a new token is not a content update.
  const {eligibility,...base}=g;
  const semantic = eligibility?{...base,eligibility:{applicantTypes:eligibility.applicantTypes,countries:eligibility.countries,notes:eligibility.notes,evidenceUrl:eligibility.evidenceUrl}}:base;
  const value = g.source === "moc" ? {...semantic, url:new URL(g.url).origin + new URL(g.url).pathname} : semantic;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
};
