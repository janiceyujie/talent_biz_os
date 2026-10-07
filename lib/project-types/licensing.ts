// Licensing existing work.
export const licensing = {
  key: "licensing",
  eventKind: "meeting",
  fullSupport: false,
  extraction: {
    description: "Use of existing work — music, recordings, photos, footage, likeness — in someone else's production (授權, 版權, 使用權, sync).",
    fields: [
      { key: "work", description: "Which work: song, recording, photo, footage" },
      { key: "use", description: "What it will be used in and how" },
      { key: "media", description: "Media and channels" },
      { key: "territory", description: "Countries or regions" },
      { key: "term", description: "How long the license lasts" },
      { key: "exclusivity", description: "Exclusive or not" },
      { key: "credit", description: "How the artist is credited" },
    ],
  },
} as const;
