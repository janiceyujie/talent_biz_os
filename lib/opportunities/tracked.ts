// The tracked pages (decision 0024): official pages with no feed, read daily.
// Each is a list of announcements; the fetcher follows only the links on it
// that are its own announcements, on its own host. Adding or removing a page
// is a code change, reviewed like any other. Pure, no server-only imports.
import type { Area } from "./areas";
import type { OpportunityKind, OpportunityRegion } from "./types";

export type TrackedPage = {
  id: string; // stable: the catalogue's calls and the page's read history are keyed by it
  url: string; // the list of announcements
  region: OpportunityRegion;
  timeZone: string; // the funding body's: its dates are days there
  agency: string; // as the card names it
  kind: OpportunityKind;
  area?: Area; // the agency's own county or city, for "residents of this city"
  /** Which links on the list are its announcements: the path and query, on the list's host. */
  items: RegExp;
  /** An announcement worth reading: a call, not a list of results. Matched on the link's title. */
  about: RegExp;
  /** Where an announcement's own text sits on its page, as HTML markers: what's outside is the site around it. */
  content?: { start?: string; end?: string };
};

const results = /名單|結果|一覽表|公告.*(獲|入選)/;

export const trackedPages: TrackedPage[] = [
  {
    id: "ncaf",
    url: "https://www.ncafroc.org.tw/news.html?categoryId=002",
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "國家文化藝術基金會",
    kind: "grant",
    items: /^\/news_detail\.html\?sid=\d+$/,
    about: /受理|徵件|收件|開放申請|申請/,
    content: { end: "回列表頁" },
  },
  {
    id: "taipei-culture",
    url: "https://culture.gov.taipei/News.aspx?n=63F36AA6E434AD08&sms=78D644F2755ACCAA",
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "臺北市政府文化局",
    kind: "grant",
    area: "TW-TPE",
    items: /^\/News_Content\.aspx\?n=63F36AA6E434AD08&sms=78D644F2755ACCAA&s=[0-9A-F]+$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求/,
    content: { start: 'class="area-essay', end: 'class="area-editor' },
  },
];

/** Whether a link's title is a call worth reading, not a list of who won. */
export const isCall = (page: TrackedPage, title: string) => page.about.test(title) && !results.test(title);

export const trackedHosts = () => new Set(trackedPages.map((p) => new URL(p.url).hostname));
