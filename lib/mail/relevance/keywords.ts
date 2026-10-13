// Words in a subject that suggest work, in both languages (decision 0013).
// They don't decide that an email is work: they only keep bulk mail from being
// skipped, so the model looks at it. Broad words that fill newsletters
// ("event", "show", the Chinese word for advertisement) are left out on purpose,
// and "offer" doesn't count in the Promotions tab, where it means a sale.

const english = [
  "offer",
  "inquiry",
  "enquiry",
  "booking",
  "collab",
  "collaboration",
  "partnership",
  "sponsor",
  "sponsored",
  "sponsorship",
  "proposal",
  "quote",
  "quotation",
  "rate card",
  "contract",
  "agreement",
  "invoice",
  "payment",
  "remittance",
  "deposit",
  "gig",
  "performance",
  "availability",
  "interview",
  "podcast",
  "campaign",
  "endorsement",
  "brief",
  "rider",
  "call time",
  "shoot",
  "casting",
  "audition",
];

// Matched anywhere in the subject: Chinese has no spaces between words.
const chinese = [
  "邀約",
  "邀請",
  "合作",
  "洽談",
  "詢問",
  "詢價",
  "報價",
  "估價",
  "合約",
  "契約",
  "簽約",
  "簽署",
  "檔期",
  "演出",
  "表演",
  "演唱",
  "商演",
  "業配",
  "代言",
  "酬勞",
  "費用",
  "發票",
  "請款",
  "匯款",
  "入帳",
  "轉帳",
  "付款",
  "款項",
  "採訪",
  "專訪",
  "訪問",
  "拍攝",
  "試鏡",
  "通告",
];

const englishPattern = new RegExp(`\\b(${english.map((w) => w.replace(/ /g, "\\s+")).join("|")})s?\\b`, "i");

const promotionsPattern = new RegExp(
  `\\b(${english
    .filter((w) => w !== "offer")
    .map((w) => w.replace(/ /g, "\\s+"))
    .join("|")})s?\\b`,
  "i",
);

/** Whether a subject has a work word in either language; `promotions` for an email in Gmail's Promotions tab. */
export const hasWorkWords = (subject: string, { promotions = false } = {}) =>
  (promotions ? promotionsPattern : englishPattern).test(subject) || chinese.some((w) => subject.includes(w));
