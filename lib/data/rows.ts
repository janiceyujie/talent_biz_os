// Database rows to the shapes the screens use: calendar items, payments with
// their receipts, contract versions, and the person's Google events. Shared by the layout's data
// (index.ts) and the pages and endpoints that fetch only what they show
// (decision 0011), so every reader gets the same shape. Pure, no queries.
import type { calendarEvent, calendarImportSource, calendarSeriesProject, contract, externalEvent, payment, paymentReceipt, todo } from "@/lib/db/schema";
import { activeReceipts } from "@/lib/domain/workflow";
import type { Currency } from "@/lib/domain/money";
import { isProjectType } from "@/lib/project-types";
import { calendarKinds, type CalendarItem, type CalendarKind, type Contract, type ExternalEvent, type Payment, type PaymentReceipt, type TravelDetails } from "@/lib/types";

type EventRow = typeof calendarEvent.$inferSelect;
type TodoRow = typeof todo.$inferSelect;
type PaymentRow = typeof payment.$inferSelect & { projectType: string | null };
type ReceiptRow = typeof paymentReceipt.$inferSelect;
type ImportedRow = typeof externalEvent.$inferSelect;
type SourceRow = typeof calendarImportSource.$inferSelect;
type SeriesRow = typeof calendarSeriesProject.$inferSelect;
type ContractRow = typeof contract.$inferSelect;

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const todoKind: Record<string, CalendarKind> = { deliverable: "deliverable", payment_due: "payment" };
const eventKind = (k: string): CalendarKind => (calendarKinds.includes(k as CalendarKind) ? (k as CalendarKind) : "meeting");

/** Events and dated to-dos as calendar items; an undated to-do has no place on a calendar. */
export function calendarItemsOf(eventRows: EventRow[], todoRows: TodoRow[]): CalendarItem[] {
  return [
    ...eventRows.map((e) => ({
      id: e.id,
      source: "event" as const,
      kind: eventKind(e.kind),
      title: e.title,
      date: e.startDate,
      time: hhmm(e.startTime),
      timeZone: e.timeZone,
      location: e.location ?? "",
      projectId: e.projectId,
      suggestedProjectId: e.suggestedProjectId,
      notes: e.notes ?? "",
      done: false,
      archived: e.archivedAt !== null,
      travel:
        e.kind === "travel" || e.kind === "accommodation"
          ? ({
              endDate: e.endDate ?? "",
              endTime: hhmm(e.endTime),
              endTimeZone: e.endTimeZone ?? "",
              transportMode: e.transportMode ?? "",
              operator: e.operator ?? "",
              serviceNumber: e.serviceNumber ?? "",
              destination: e.destination ?? "",
              seat: e.seat ?? "",
              hotelName: e.hotelName ?? "",
            } satisfies TravelDetails)
          : null,
      endDate: e.kind !== "travel" && e.kind !== "accommodation" ? (e.endDate ?? "") : "",
      endTime: e.kind !== "travel" && e.kind !== "accommodation" ? hhmm(e.endTime) : "",
    })),
    ...todoRows
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: t.id,
        source: "todo" as const,
        kind: todoKind[t.type] ?? ("todo" as const),
        title: t.title,
        date: t.dueDate!,
        time: hhmm(t.dueTime),
        timeZone: t.timeZone,
        location: "",
        projectId: t.projectId,
        suggestedProjectId: null,
        notes: t.notes ?? "",
        done: t.status === "done",
        archived: t.status === "dismissed",
        travel: null,
        endDate: "",
        endTime: "",
      })),
  ];
}

/** Payments with their receipts, oldest receipt first. */
export function paymentsOf(paymentRows: PaymentRow[], receiptRows: ReceiptRow[]): Payment[] {
  const receiptsOf = new Map<string, PaymentReceipt[]>();
  for (const r of receiptRows)
    receiptsOf.set(r.paymentId, [
      ...(receiptsOf.get(r.paymentId) ?? []),
      { id: r.id, date: r.receivedOn, cash: r.cash, withheld: r.withheld, note: r.note ?? "", replacesId: r.replacesId, withdrawn: r.withdrawn, recordedAt: r.createdAt.toISOString() },
    ]);
  return paymentRows.map((p) => {
    const receipts = receiptsOf.get(p.id) ?? [];
    return {
      id: p.id,
      projectId: p.projectId,
      projectType: p.projectType && isProjectType(p.projectType) ? p.projectType : "other",
      direction: p.direction,
      installment: p.installment,
      label: p.label,
      amount: p.amount,
      currency: p.currency as Currency,
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      recordedDate: p.recordedOn,
      dueDate: p.dueOn,
      status: p.status,
      receipts,
      // Worked out, never stored (decision 0021): the day the last receipt that counts arrived.
      settledDate: p.status === "settled" ? (activeReceipts({ receipts }).map((r) => r.date).sort().at(-1) ?? null) : null,
      invoiceRef: p.invoiceRef ?? "",
      notes: p.notes ?? "",
      voided: p.voidedAt !== null,
    };
  });
}

/** The person's own Google events, with their calendar's name and colour, and a repeating event's project (decision 0017). */
export function externalEventsOf(importedRows: ImportedRow[], importSources: SourceRow[], seriesLinks: SeriesRow[]): ExternalEvent[] {
  return importedRows.map((e) => {
    const source = importSources.find((x) => x.id === e.sourceId)!;
    return {
      id: e.id,
      calendar: source.name,
      color: source.color,
      title: e.title,
      date: e.startDate,
      time: hhmm(e.startTime),
      endDate: e.endDate ?? "",
      endTime: hhmm(e.endTime),
      timeZone: e.timeZone,
      location: e.location ?? "",
      link: e.htmlLink ?? "",
      series: source.own && e.seriesId ? { id: e.seriesId, projectId: seriesLinks.find((l) => l.seriesId === e.seriesId)?.projectId ?? null } : null,
    };
  });
}

/** Contract versions, in the order given (newest first where they're listed). */
export function contractsOf(rows: ContractRow[]): Contract[] {
  return rows.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    messageId: c.messageId,
    version: c.versionNumber,
    status: c.status,
    terms: c.terms,
    diff: c.diff ?? [],
    against: c.supersedesId ? ("version" as const) : ("project" as const),
    createdAt: c.createdAt.toISOString(),
  }));
}
