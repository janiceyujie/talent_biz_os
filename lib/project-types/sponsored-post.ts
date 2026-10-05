// A paid post or product review (業配).
export const sponsoredPost = {
  key: "sponsored_post",
  eventKind: "meeting",
  fullSupport: false,
  extraction: {
    description: "A paid or gifted post about a product or service: review, unboxing, mention, affiliate post (業配, 開箱, 置入, 團購).",
    fields: [
      { key: "brand", description: "The brand or seller" },
      { key: "product", description: "The product or service" },
      { key: "platforms", description: "Where to post" },
      { key: "deliverables", description: "Posts and their formats and counts" },
      { key: "postingDate", description: "When to post" },
      { key: "productShipping", description: "Product sent, kept, or returned" },
      { key: "revisions", description: "Script or draft review and revision rounds" },
      { key: "disclosure", description: "Sponsorship disclosure, discount codes, affiliate links" },
    ],
  },
} as const;
