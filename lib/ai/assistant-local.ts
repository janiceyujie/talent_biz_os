import { assistantContext, type AssistantSource } from "./assistant-context";
import { paymentTotal } from "@/lib/domain/workflow";
import type { TokenUsage } from "./local-budget";

export const LOCAL_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
// Full-query matching is deliberate: mixed requests, named parties and date filters
// must not accidentally receive an unrelated workspace-wide total.
export function localAssistantIntent(query: string) {
  const q = query.trim().toLowerCase().replace(/[?!！？。]+$/u, "").trim();
  if (/^(test(?:ing)?(?: 123)?|測試|測試一下|測試中)$/.test(q)) return "test";
  if (/^(hi|hello|hey|你好|嗨|哈囉|how are you|你好嗎)$/.test(q)) return "greeting";
  if (/^(今日行程|今天的?行程|我今天要做什麼|今天有什麼行程|today['’]s schedule|what do i need to do today|what['’]s on today)$/.test(q)) return "today";
  if (/^(明日行程|明天的?行程|我明天要做什麼|明天有什麼行程|tomorrow['’]s schedule|what do i need to do tomorrow|what['’]s on tomorrow)$/.test(q)) return "tomorrow";
  if (/^(待收款項?|還有多少錢沒收|目前待收款是多少|應收款項?|outstanding payments|receivables|unpaid income|how much hasn['’]t been paid yet|how much am i owed)$/.test(q)) return "receivable";
  if (/^(待付款項?|還有多少錢要付|目前待付款是多少|應付款項?|payables|payments due|how much do i owe)$/.test(q)) return "payable";
  return null;
}

type LocalKey = keyof typeof import("../../messages/en.json")["assistant"]["local"];
type Translate = (key: LocalKey, values?: Record<string, string | number>) => string;
export function localAssistantReply(data: AssistantSource, query: string, projectId: string | undefined, sample: boolean, today: string, t: Translate): string | null {
  const intent = localAssistantIntent(query);
  if (!intent) return null;
  // Validate project scope even for a local reply; never fall back to another project.
  const context = assistantContext(data, projectId, sample, today);
  if (intent === "test" || intent === "greeting") return t(intent);
  const prefix = sample ? t("sample") + "\n" : "";
  if (intent === "receivable" || intent === "payable") {
    const direction = intent === "receivable" ? "in" : "out";
    const payments = data.payments.filter(p => !p.voided && p.status === "expected" && p.direction === direction && (!projectId || p.projectId === projectId));
    const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(context.money[intent]);
    const details = payments.slice(0, 30).map(p => t("paymentLine", { label: p.label, amount: new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(paymentTotal(p)), date: p.dueDate || t("dateUnknown") }));
    if (payments.length > 30) details.push(t("omitted", { count: payments.length - 30 }));
    return prefix + [t(intent, { amount }), t("moneyBasis"), ...details].join("\n");
  }
  const date = new Date(`${today}T12:00:00Z`);
  if (intent === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
  const day = date.toISOString().slice(0, 10);
  const events = data.calendar.filter(c => !c.archived && !c.done && c.date === day && (!projectId || c.projectId === projectId));
  const items = events.sort((a, b) => a.time.localeCompare(b.time)).map(c => t("eventLine", { time: c.time || t("timeUnknown"), title: c.title, zone: c.timeZone }));
  const projects = data.projects.filter(p => !p.archived && !["closed", "declined", "cancelled"].includes(p.stage) && (!projectId || p.id === projectId) && p.nextAction?.dueDate === day);
  for (const p of projects) {
    if (!events.some(c => c.projectId === p.id && c.title === p.nextAction!.title)) items.push(t("taskLine", { title: p.nextAction!.title, project: p.title }));
  }
  return prefix + [t("schedule", { date: day, zone: data.talent.timeZone }), ...(items.slice(0, 30).length ? items.slice(0, 30) : [t("emptySchedule")]), ...(items.length > 30 ? [t("omitted", { count: items.length - 30 })] : [])].join("\n");
}
