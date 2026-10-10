// What to bring in when a mailbox is connected (decision 0013): the last 30 days, or only new mail.
export const historyModes = ["30_days", "new_only"] as const;
export type HistoryMode = (typeof historyModes)[number];
