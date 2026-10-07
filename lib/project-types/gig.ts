// A performance or event appearance (Gig).
export const gig = {
  key: "gig",
  eventKind: "performance",
  fullSupport: true,
  extraction: {
    description: "A performance or event appearance: concert, club show, festival slot, wedding or corporate gig, DJ set, live appearance (演出, 表演, 商演, live).",
    fields: [
      { key: "eventName", description: "Name of the event, festival, or show" },
      { key: "venue", description: "Venue or location name" },
      { key: "city", description: "City or area" },
      { key: "setLength", description: "Length of the performance or set" },
      { key: "loadIn", description: "Arrival, load-in, or setup time" },
      { key: "soundcheck", description: "Soundcheck or rehearsal time" },
      { key: "equipment", description: "Gear or backline provided, or requested of the artist" },
      { key: "hospitality", description: "Meals, drinks, green room, guest list" },
      { key: "travel", description: "Transport and accommodation, and who pays for them" },
    ],
  },
} as const;
