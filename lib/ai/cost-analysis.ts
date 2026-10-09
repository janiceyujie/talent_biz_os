import { usageTotals, type EvaluationRow } from "./assistant-records";
export type CostRow = EvaluationRow & { mode?: "local" | "ai"; conversationId?: string; turn?: number };
export function summarizeCosts(rows: CostRow[], aiOnly = false) {
  const valid = rows.filter(r => r.status === "completed" && r.usage && r.estimatedCostUSD !== undefined);
  const selected = aiOnly ? valid.filter(r => r.mode !== "local" && r.usage!.inputTokens > 0) : valid;
  const totals = usageTotals(selected);
  const sorted = selected.map(r => r.estimatedCostUSD!).sort((a,b) => a-b);
  const count = selected.length;
  return {...totals, count, failed: rows.length-valid.length, local: valid.filter(r=>r.mode==="local").length,
    mean: count ? totals.cost/count : 0, meanTokens: count ? totals.total/count : 0,
    min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0, p95: sorted[Math.max(0,Math.ceil(count*.95)-1)] ?? 0};
}
export function projectCosts(rows: CostRow[], daily: number, days = 30) {
  if (!Number.isInteger(daily) || daily < 0 || !Number.isInteger(days) || days < 0) throw Error("Invalid usage projection");
  const s=summarizeCosts(rows,true), count=daily*days;
  return {count,tokens:s.meanTokens*count,mean:s.mean*count,min:s.min*count,max:s.max*count,p95:s.p95*count};
}
// Proposed release limits only. These are not enforced by the current local experiment.
export const PROPOSED_LIMITS={inputTokens:6000,outputTokens:1500,worstCostUSD:(6000*.125+1500*.5)/1e6};
export function evaluationCSV(rows: CostRow[]) {
  const cell=(v:unknown)=>{const s=String(v??"");return '"'+(/^[=+@\-\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')+'"';};
  const table:unknown[][]=[["ID","Category","Mode","Conversation","Turn","Status","Input tokens","Output tokens","Total tokens","Cached input tokens","Cache write tokens","Reasoning tokens (included in output)","Estimated USD","Question","Answer"]];
  for(const r of rows)table.push([r.id,r.category,r.mode??"ai",r.conversationId,r.turn,r.status,r.usage?.inputTokens,r.usage?.outputTokens,r.usage?(r.usage.inputTokens+r.usage.outputTokens):undefined,r.usage?.cachedInputTokens,r.usage?.cacheWriteTokens,r.usage?.reasoningTokens,r.estimatedCostUSD,r.query,r.text]);
  return '\uFEFF'+table.map(r=>r.map(cell).join(',')).join('\r\n');
}
