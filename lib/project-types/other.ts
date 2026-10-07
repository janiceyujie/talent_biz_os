// Anything else: only the core fields.
export const other = {
  key: "other",
  eventKind: "meeting",
  fullSupport: false,
  extraction: {
    description: "Work that fits none of the other types: teaching, writing, judging, consulting, and so on.",
    fields: [{ key: "workDescription", description: "What the work is" }],
  },
} as const;
