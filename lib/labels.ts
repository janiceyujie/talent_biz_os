// UI labels for code values. Glossary: docs/architecture.md#glossary.
import type { CalendarKind, ContactRole, Payment, Stage } from "@/lib/types";

export const stageLabels: Record<Stage, string> = {
  offer: "待確認",
  negotiating: "洽談中",
  signed: "已簽約",
  in_progress: "執行中",
  collecting_payment: "待結算",
  closed: "已完成",
  declined: "已婉拒",
  cancelled: "已取消",
};

/** Stages that still need work; the rest are done one way or another. */
export const openStages: Stage[] = ["offer", "negotiating", "signed", "in_progress", "collecting_payment"];

export const contactRoleLabels: Record<ContactRole, string> = {
  artist: "藝人",
  counterparty: "合作方",
  manager: "經紀人",
};

export const calendarKindLabels: Record<CalendarKind, string> = {
  todo: "待辦",
  performance: "演出",
  deliverable: "交付",
  meeting: "會議",
  travel: "交通",
  accommodation: "住宿",
  payment: "付款",
};

export const directionLabels: Record<Payment["direction"], string> = { in: "收入", out: "成本" };

export const installmentLabels: Record<Payment["installment"], string> = {
  regular: "一般",
  deposit: "訂金",
  balance: "尾款",
};

export function paymentStatusLabel(p: Pick<Payment, "direction" | "status">) {
  if (p.status === "cancelled") return "已取消";
  if (p.direction === "in") return p.status === "settled" ? "已收" : "待收";
  return p.status === "settled" ? "已付" : "待付";
}
