import {sql} from "drizzle-orm";
import {payment} from "@/lib/db/schema";
/** Correlated active receipt totals; the enclosing payment query enforces membership. */
export const receiptCashSql=(from="",to="9999-12-31")=>sql<number>`coalesce((select sum(r.cash) from payment_receipt r where r.payment_id=${payment.id} and r.talent_id=${payment.talentId} and not r.withdrawn and not exists(select 1 from payment_receipt x where x.replaces_id=r.id and x.talent_id=r.talent_id) and r.received_on between coalesce(nullif(${from},'')::date,'0001-01-01'::date) and ${to}::date),0)`;
export const receiptCoveredSql=()=>sql<number>`coalesce((select sum(r.cash+r.withheld) from payment_receipt r where r.payment_id=${payment.id} and r.talent_id=${payment.talentId} and not r.withdrawn and not exists(select 1 from payment_receipt x where x.replaces_id=r.id and x.talent_id=r.talent_id)),0)`;
