import { getOpportunityNotifications } from "@/lib/data/grant-changes";
import { z } from "zod";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice, notificationState, payment, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { invoiceJson } from "@/lib/invoices/http";
import type { Notification } from "@/lib/domain/notifications";

/** One small, owner-scoped feed shared by the bell and daily briefing. No mail side effects. */
export async function GET(req: Request) {
  const cursor = new URL(req.url).searchParams.get("after");
  const parts = cursor?.split(":");
  if (parts && (parts.length !== 2 || !z.iso.date().safeParse(parts[0]).success || !z.uuid().safeParse(parts[1]).success)) return invoiceJson({error:"invalid"},400);
  const session = await getSession();
  if (!session) return invoiceJson({ error: "forbidden" }, 401);
  const current = await getCurrentTalent(session.personId);
  if (!current) return invoiceJson({ error: "forbidden" }, 403);
  const [workspace] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, current.id));
  const now = new Date(), day = dateInZone(workspace.timeZone, 0, now);
  const [rows, states, unprepared, opportunityItems] = await Promise.all([
    db.select({ id: invoice.id, number: invoice.number, snapshot: invoice.snapshot, issueOn: invoice.issueOn, status: invoice.status, revision: invoice.revision })
      .from(invoice).innerJoin(payment, and(eq(payment.id, invoice.paymentId), eq(payment.talentId, current.id)))
      .where(and(eq(invoice.talentId, current.id), lte(invoice.issueOn, day),
        parts ? or(gt(invoice.issueOn,parts[0]),and(eq(invoice.issueOn,parts[0]),gt(invoice.id,parts[1]))) : undefined,
        inArray(invoice.status, ["scheduled", "draft", "draft_unknown", "draft_missing", "delivery_unknown"]),
        isNull(payment.voidedAt), eq(payment.status, "expected")))
      .orderBy(asc(invoice.issueOn), asc(invoice.id)).limit(21),
    db.select().from(notificationState).where(and(eq(notificationState.personId, session.personId),
      sql`coalesce(${notificationState.snoozedUntil}, ${notificationState.readAt}) > now() - interval '90 days'`)),
    db.select({id:payment.id,label:payment.label,date:payment.invoiceOn}).from(payment)
      .where(and(eq(payment.talentId,current.id),eq(payment.direction,"in"),inArray(payment.currency,["USD","TWD"]),eq(payment.status,"expected"),isNull(payment.voidedAt),lte(payment.invoiceOn,day),parts ? or(gt(payment.invoiceOn,parts[0]),and(eq(payment.invoiceOn,parts[0]),gt(payment.id,parts[1]))) : undefined,sql`${payment.amount} > 0`,
        or(isNull(payment.projectId), sql`exists (select 1 from ${project} where ${project.id} = ${payment.projectId} and ${project.talentId} = ${current.id} and ${project.archivedAt} is null and ${project.stage} in ('signed', 'in_progress', 'collecting_payment', 'closed'))`),
        sql`not exists (select 1 from ${invoice} where ${invoice.paymentId} = ${payment.id} and ${invoice.talentId} = ${current.id} and ${ne(invoice.status,"cancelled")})`))
      .orderBy(asc(payment.invoiceOn),asc(payment.id)).limit(21),
    getOpportunityNotifications(current.id,session.personId,parts),
  ]);
  const items: Notification[] = rows.map(row => ({
    id: `invoice:${row.id}:${row.revision}:${row.issueOn}`, kind: "invoice", title: row.snapshot.buyerName,
    number: row.number, status: row.status, date: row.issueOn, time: "", timeZone: workspace.timeZone,
    urgency: row.issueOn < day ? "overdue" : "today", dueAt: null,
    href: `/finance?invoice=${row.id}#invoices`,
  }));
  items.push(...unprepared.map(row => ({
    id:`billing:${row.id}:${row.date}`,kind:"invoice" as const,title:row.label,number:"",status:"unprepared" as const,date:row.date!,time:"",timeZone:workspace.timeZone,
    urgency:row.date! < day ? "overdue" as const : "today" as const,dueAt:null,href:`/finance?invoicePayment=${row.id}#invoices`,
  })));
  items.push(...opportunityItems);
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.id.split(":")[1].localeCompare(b.id.split(":")[1]));
  const last=items[19];
  return invoiceJson({ items:items.slice(0,20), hasMore: items.length > 20, nextCursor:items.length > 20 ? `${last.date}:${last.id.split(":")[1]}` : null, now: now.toISOString(),
    state: Object.fromEntries(states.map(s => [s.notificationId, { readAt: s.readAt?.toISOString() ?? null, snoozedUntil: s.snoozedUntil?.toISOString() ?? null }])),
  });
}
