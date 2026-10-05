// A brand collaboration or campaign (品牌合作).
export const brandDeal = {
  key: "brand_deal",
  eventKind: "meeting",
  fullSupport: false,
  extraction: {
    description: "A collaboration with a brand: campaign, ambassadorship, branded content, event or product launch appearance, co-created content (品牌合作, 代言, campaign).",
    fields: [
      { key: "brand", description: "The brand or client" },
      { key: "campaign", description: "Campaign or project name" },
      { key: "platforms", description: "Where the content goes: Instagram, YouTube, TikTok, TV, print…" },
      { key: "deliverables", description: "What to produce: formats and counts (e.g. 1 Reel + 3 Stories)" },
      { key: "schedule", description: "Shoot, draft, and posting dates or window" },
      { key: "usageRights", description: "How the brand may use the content: media, duration, territory, paid ads" },
      { key: "exclusivity", description: "Competitor exclusivity: category and period" },
      { key: "approvals", description: "Review and revision rounds" },
    ],
  },
} as const;
