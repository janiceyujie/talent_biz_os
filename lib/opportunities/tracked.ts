// The tracked pages (decision 0024): official pages with no feed, read daily.
// Each is a list of announcements; the fetcher follows only the links on it
// that are its own announcements, on its own host. Adding or removing a page
// is a code change, reviewed like any other. Pure, no server-only imports.
import type { Area } from "./areas";
import { outOfScope } from "./scope";
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

const results = /名單|結果|一覽表|複審|初審|決選|入圍|錄取|公告.*(獲|入選)/; // who was chosen, at any round

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
  // The municipal culture bureaus: each one's list of its own calls, where it has one, else its notices.
  {
    id: "taipei-culture",
    url: "https://culture.gov.taipei/News.aspx?n=9305B5181A62191D&sms=39A01F1F3DB5F46C", // Subsidies (各項補助資訊)
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "臺北市政府文化局",
    kind: "grant",
    area: "TW-TPE",
    items: /^\/News_Content\.aspx\?n=9305B5181A62191D&sms=39A01F1F3DB5F46C&s=[0-9A-F]+$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|受理/,
    content: { start: 'class="area-essay', end: 'class="area-editor' },
  },
  {
    id: "new-taipei-culture",
    url: "https://www.culture.ntpc.gov.tw/xceventsnews?xsmsid=0G295700334178642420&qcat=0G295702776245651904", // Calls and applications
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "新北市政府文化局",
    kind: "grant",
    area: "TW-NWT",
    items: /^\/xceventsnews\/cont\?xsmsid=0G295700334178642420&qcat=0G295702776245651904&sid=\w+$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|收件|受理/,
    content: { start: 'class="district"', end: 'class="post_info' },
  },
  {
    id: "taoyuan-culture",
    url: "https://culture.tycg.gov.tw/News.aspx?n=11134&sms=14579", // Subsidies
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "桃園市政府文化局",
    kind: "grant",
    area: "TW-TAO",
    items: /^\/News_Content\.aspx\?n=11134&s=\d+$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|受理/,
    content: { start: 'class="area-essay', end: 'class="area-editor' },
  },
  {
    id: "taichung-culture",
    url: "https://www.culture.taichung.gov.tw/2061063/2098039", // Notices
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "臺中市政府文化局",
    kind: "grant",
    area: "TW-TXG",
    items: /^\/\d+\/post$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|受理/,
    content: { start: 'id="cpArticle"', end: 'class="pubInfo"' },
  },
  {
    id: "tainan-culture",
    url: "https://culture.tainan.gov.tw/latestevent/index?Parser=9,3,84,32", // Notices
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "臺南市政府文化局",
    kind: "grant",
    area: "TW-TNN",
    items: /^\/latestevent\/Details\?Parser=9,3,84,32,,,\d+$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|受理/,
    content: { start: 'class="content_title"', end: 'class="update"' },
  },
  {
    id: "kaohsiung-culture",
    url: "https://khcc.kcg.gov.tw/rwd_home02.aspx?ID=$5101&IDK=2&EXEC=L", // News: its own, not the other bodies' calls it relays
    region: "TW",
    timeZone: "Asia/Taipei",
    agency: "高雄市政府文化局",
    kind: "grant",
    area: "TW-KHH",
    items: /^\/rwd_home02\.aspx\?ID=\$5101&IDK=2&EXEC=D&DATA=\d+&AP=\$5101_HISTORY-0\^\$5101_PN-1$/,
    about: /補助|獎助|徵件|徵選|甄選|徵求|受理/,
    content: { start: 'id="mydesc"', end: ">BACK<" },
  },
];

/** Whether a link's title is a call worth reading: not a list of who won, nor outside what Opportunities is for. */
export const isCall = (page: TrackedPage, title: string) => page.about.test(title) && !results.test(title) && !outOfScope(title);

export const trackedHosts = () => new Set(trackedPages.map((p) => new URL(p.url).hostname));
