import type { InboxMessage } from "@/lib/types";

export type PreviewIntakeTab = "messages" | "waiting" | "skipped";
export type PreviewIntakeItem = { message: InboxMessage; initialTab: PreviewIntakeTab };

/** Synthetic fixtures only: keep real mailbox ids and mutation actions out of this flow. */
export function previewIntakeItems(inbox: InboxMessage[], text: (key: `samples.${"brand" | "podcast" | "sale"}.${"title" | "body" | "sender"}`) => string): PreviewIntakeItem[] {
  const base = inbox.find(message => message.analysis);
  const existing = inbox.map(message => ({ message, initialTab: message.analysis?.intent === "other" ? "skipped" as const : "messages" as const }));
  if (!base?.analysis) return existing;
  const additions = [
    ["brand", "waiting", "inquiry"],
    ["podcast", "waiting", "inquiry"],
    ["sale", "skipped", "other"],
  ] as const;
  return [...existing, ...additions.map(([key, initialTab, intent]) => {
    const title = text(`samples.${key}.title`);
    const body = text(`samples.${key}.body`);
    return { initialTab, message: {
      ...base, id: `preview-intake-${key}`, projectId: null, filed: undefined,
      status: "analyzed" as const, failure: null, files: [], gmail: null, body,
      analysis: { ...base.analysis!, title, summary: body, intent, projectType: "other" as const,
        money: { amount: null, currency: "", taxIncluded: null, asStated: "" },
        counterparty: { name: text(`samples.${key}.sender`), company: "", email: `${key}@example.invalid`, phone: "" },
        dates: [], details: {}, asks: [], missing: [], flags: [], assumptions: [],
        paymentTerms: "", replyBy: "", replyByStated: "", confidence: 1,
        modelVersion: "synthetic-fixture", promptVersion: "preview-intake-v1" },
    } };
  })];
}

export function previewIntakeTab(item: PreviewIntakeItem, overrides: Record<string, PreviewIntakeTab>): PreviewIntakeTab {
  return overrides[item.message.id] ?? item.initialTab;
}
