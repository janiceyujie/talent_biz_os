// Email, by either way in: the connected mailbox (`gmail`) or the Gmail add-on
// (`gmail_addon`). Both carry a sender, subject, and thread, and are real Gmail
// content (decision 0015's mailbox rule). Pure, no server-only imports.
export const isEmailChannel = (channel: string) => channel === "gmail" || channel === "gmail_addon";
