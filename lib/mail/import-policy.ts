import type { MailMetadata } from "./metadata";
/** Import protection is independent of upstream relevance classification. */
export function restrictedImport(m: Pick<MailMetadata,"subject"|"labels">, kind?: string | null) {
  return kind === "payment" || m.labels.some(l=>["TRASH","SPAM","DRAFT"].includes(l)) || /\b(invoice|remittance|payment (received|confirmation|notice)|bank transfer)\b|發票|匯款通知|收款通知|付款通知/i.test(m.subject);
}
