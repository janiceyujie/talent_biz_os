import en from "@/messages/en.json";
import zh from "@/messages/zh-TW.json";
import type { Locale } from "@/lib/i18n/config";

export const documentScenarios = [{"id": "live", "role": "musician"}, {"id": "license", "role": "musician"}, {"id": "management", "role": "manager"}, {"id": "model", "role": "model"}, {"id": "brand", "role": "influencer"}, {"id": "video", "role": "video"}, {"id": "podcast", "role": "other"}, {"id": "general", "role": "other"}, {"id": "session", "role": "musician"}, {"id": "booking", "role": "manager"}, {"id": "campaign-management", "role": "manager"}, {"id": "runway", "role": "model"}, {"id": "ambassador", "role": "model"}, {"id": "ugc", "role": "influencer"}, {"id": "affiliate", "role": "influencer"}, {"id": "editing", "role": "video"}, {"id": "event-video", "role": "video"}, {"id": "podcast-guest", "role": "other"}] as const;
export type DocumentScenario = typeof documentScenarios[number]["id"];
export type DocumentKind = "contract" | "quote";

export function documentContent(id: DocumentScenario, kind: DocumentKind, locale: Locale) {
  const copy = (locale === "zh-TW" ? zh : en).documentLibrary;
  const item = copy.documents[id];
  const c = copy.common;
  if (kind === "contract") {
    const common = copy.contractCommon;
    const contract = item.contract;
    const parties = (["partyA", "partyB"] as const).map(role => `${contract[role]} ${common.legalName} (${common.partySuffix} ${common[role]})`).join("\n");
    const articles = [
      [common.scopeTitle, item.scope], [common.termTitle, contract.term], [common.acceptanceTitle, contract.acceptance],
      [common.feesTitle, common.fees], [common.paymentTitle, common.payment], [contract.rightsTitle, item.rights],
      [common.cancelTitle, c.cancel], [common.legalTitle, common.legal], [common.otherTitle, common.other],
    ].map(([heading, body], index) => [
      common.article.replace("{number}", common.numberLabels.split("|")[index]) + " " + heading,
      body.split("\n").map((line, n) => `${n + 1}. ${line}`).join("\n") + (index === 4 ? `\n${common.bank}` : ""),
    ]);
    const signatures = (["partyA", "partyB"] as const).map(role => `${common[role]} ${contract[role]}\n${common.signFields}\n${common.signature} ______________________________\n${common.date}`).join("\n\n");
    const sections = [[common.partiesTitle, parties], ...articles, [common.signTitle, signatures + "\n\n" + common.executionDate]];
    return { title: contract.title, intro: common.intro, sections, text: [contract.title,common.partiesTitle,parties,common.intro,...sections.slice(1).map(([h,b])=>`${h}\n${b}`)].join("\n\n") };
  }
  const sections = [
    [c.partiesTitle,c.parties], [c.scopeTitle,item.scope], [c.lineTitle,c.lineHelp+"\n"+item.lines.split(" | ").map(x=>x+" [___]").join("\n")],
    [c.paymentTitle,c.totals], [c.rightsTitle,item.rights], [c.quoteTermsTitle,c.quoteTerms],
  ];
  const title = `${item.title} ${copy.quote}`;
  return { title, intro: c.quoteIntro, sections, text: [title,c.quoteIntro,...sections.map(([h,b])=>`${h}\n${b}`)].join("\n\n") };
}
export function documentFilename(id: DocumentScenario, kind: DocumentKind, locale: Locale) {
  return `taloox-${id}-${kind}-${locale}.docx`;
}
