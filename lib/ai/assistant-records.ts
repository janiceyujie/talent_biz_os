import type { TokenUsage } from "./local-budget";
export type AssistantRecord = {
  id: string; conversationId: string; at: string; sample: boolean; projectId?: string;
  mode?: "local" | "ai"; query: string; text: string; usage: TokenUsage; estimatedCostUSD: number; model: string;
};
export type EvaluationRow = {
  id: string; category: string; query: string; text?: string; status: string;
  usage?: TokenUsage; estimatedCostUSD?: number; error?: string;
};
export type EvaluationRun = { id: string; model: string; updatedAt: string; rows: EvaluationRow[] };
export type AssistantArchive = { records: AssistantRecord[]; truncated: boolean; nextCursor: string | null };
export function usageTotals(rows: { usage?: TokenUsage; estimatedCostUSD?: number }[]) {
  return rows.reduce((sum, row) => ({
    input: sum.input + (row.usage?.inputTokens ?? 0),
    output: sum.output + (row.usage?.outputTokens ?? 0),
    total: sum.total + (row.usage?.inputTokens ?? 0) + (row.usage?.outputTokens ?? 0),
    cost: sum.cost + (row.estimatedCostUSD ?? 0),
  }), { input: 0, output: 0, total: 0, cost: 0 });
}
