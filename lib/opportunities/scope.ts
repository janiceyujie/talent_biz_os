// What Opportunities is for (decision 0024): calls an artist, a creator, or
// their group applies for, to make, show, or take their work further. Not
// scholarships or student aid, academic research, the upkeep of historic
// buildings, running a business around the arts (a bookshop, ticketing,
// space lent out), or a museum's or library's own programs. Matched on a
// call's title in either language, the same for every source; a call this
// misses is added here. Pure, no server-only imports.

const outside = [
  /獎學金|助學金|就學|學年度|學期/, // scholarships and student aid
  /論文|研究生|學術/, // academic research
  /老屋|古蹟|歷史建築|紀念建築|聚落建築群|受保護樹木|文化資產.{0,6}(修復|維護|保存)/, // the upkeep of historic places
  /實體書店|售票業者|購票系統|票券實名制|提供適當空間/, // the business around the arts, not the work
  /\b(scholarships?|dissertations?|theses|thesis)\b/i,
  /\b(museums?|librar(y|ies)|librarians?|indemnity|preservation)\b/i, // the institutions' own programs
  /\bcrash\b/i, // filed under Grants.gov's arts category, about road safety
];

export const outOfScope = (title: string) => outside.some((pattern) => pattern.test(title));
