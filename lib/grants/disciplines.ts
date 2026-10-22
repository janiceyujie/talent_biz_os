/** Discovery tags describe the work, never an applicant's eligibility. */
export const opportunityDisciplines = ["music", "photography", "film", "fashion", "design", "visual_art", "performing_arts", "literature", "multidisciplinary"] as const;
export type OpportunityDiscipline = (typeof opportunityDisciplines)[number];
const rules: [OpportunityDiscipline, RegExp][] = [
  ["music", /音樂|音楽|金曲|金音|作曲|詞曲|歌曲|歌唱|樂團|聲樂|合唱|熱音|\b(?:music|songwriting|songwriters?|compos(?:er|ition)s?|orchestra|bands?)\b/i],
  ["photography", /攝影(?:比賽|徵件|展|競賽)|(?:國際|新光三越).*攝影|\b(?:photography|photographic|photo contest)\b/i],
  ["film", /電影|影展|影像|短片|紀錄片|動畫|金馬|金穗|金鐘|\b(?:films?|filmmaking|cinema|animation|video)\b/i],
  ["fashion", /時裝|時尚|服裝|\b(?:fashion|textile|apparel)\b/i],
  ["design", /設計|插畫|\b(?:design|illustration)\b/i],
  ["visual_art", /美術|當代藝術|視覺藝術|雙年展|繪畫|雕塑|\b(?:visual arts?|fine arts?|art fair|art exhibition)\b/i],
  ["performing_arts", /表演藝術|舞蹈|劇場|戲劇|\b(?:performing arts?|dance|theat(?:re|er))\b/i],
  ["literature", /文學|閱讀|文藝創作|詩作|\b(?:literature|literary|poetry|creative writing)\b/i],
];
/** Use reviewed tags first; otherwise only the title, never navigation/footer/summary keywords. */
export function classifyDisciplines(listing: {title:string; disciplines?: readonly OpportunityDiscipline[] | null}): OpportunityDiscipline[] {
  const tags=listing.disciplines ?? rules.filter(([,rule])=>rule.test(listing.title.normalize("NFKC"))).map(([tag])=>tag);
  return opportunityDisciplines.filter(tag=>tags.includes(tag));
}
