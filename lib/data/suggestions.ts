import "server-only";
import { getAppData } from "@/lib/data";
import { correspondentsFor } from "@/lib/data/correspondents";
import { intakeContext, suggestTargets } from "@/lib/domain/intake";
import type { InboxMessage, OpenedMessage } from "@/lib/types";

/** Suggestions shown, at most. */
const SHOWN = 3;

/**
 * Which projects a message most likely belongs to, scored on the server
 * (decision 0019): the thread, who it's from — the projects' contacts and
 * where the sender corresponds (by email) — and the live projects' dates,
 * details, payments, and titles. No past messages are read.
 */
export async function withSuggestions(talentId: string, m: InboxMessage): Promise<OpenedMessage> {
  if (!m.analysis || m.status !== "analyzed") return { ...m, suggestions: [] };
  const data = await getAppData();
  const sender = m.gmail && !m.gmail.sent ? m.gmail.sender : "";
  const email = (sender.match(/<([^<>]+)>\s*$/)?.[1] ?? sender) || m.analysis.counterparty.email;
  const correspondents = (await correspondentsFor(talentId, email)).map((c) => ({ projectId: c.projectId, lastAt: c.lastAt.toISOString() }));
  return { ...m, suggestions: suggestTargets(m.analysis, intakeContext(data, m, { correspondents })).slice(0, SHOWN) };
}
