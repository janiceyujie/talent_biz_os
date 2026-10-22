import "server-only";
import {and,asc,eq,inArray} from "drizzle-orm";
import {db} from "@/lib/db";
import {payment,paymentReceipt} from "@/lib/db/schema";
import {paymentBalance,type PaymentReceipt} from "@/lib/domain/payment-receipts";
export type ReceiptTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentRow=typeof payment.$inferSelect;
/** One canonical receipt table; the legacy form's names are adapted only at this boundary. */
export async function withReceiptRows<T extends PaymentRow>(reader:Pick<ReceiptTx,"select">,rows:T[]){
 const records=rows.length?await reader.select().from(paymentReceipt).where(and(inArray(paymentReceipt.paymentId,rows.map(r=>r.id)),inArray(paymentReceipt.talentId,[...new Set(rows.map(r=>r.talentId))]))).orderBy(asc(paymentReceipt.createdAt),asc(paymentReceipt.id)):[];
 return rows.map(row=>{
  const receipts=records.filter(r=>r.paymentId===row.id&&r.talentId===row.talentId).map(r=>({id:r.id,date:r.receivedOn,cash:r.cash,withheld:r.withheld,replaces:r.replacesId??undefined,replacesId:r.replacesId,withdrawn:r.withdrawn,note:r.note??"",recordedAt:r.createdAt.toISOString(),recordedBy:r.recordedBy??undefined}));
  return {...row,receipts,settledAmount:paymentBalance({...row,receipts,settledAmount:0}).cash,settledOn:row.status==="settled"?receipts.filter(r=>!r.withdrawn&&!receipts.some(x=>x.replaces===r.id)).map(r=>r.date).sort().at(-1)??null:null};
 });
}
export async function readLockedPayment(tx:ReceiptTx,talentId:string,id:string){
 const rows=await tx.select().from(payment).where(and(eq(payment.talentId,talentId),eq(payment.id,id))).for("update");
 return (await withReceiptRows(tx,rows))[0]??null;
}
export type ReceiptPayment=NonNullable<Awaited<ReturnType<typeof readLockedPayment>>>;
/** Under the payment lock, insert only new immutable history rows and derive its status. */
export async function persistReceipts(tx:ReceiptTx,p:ReceiptPayment,values:{receipts?:PaymentReceipt[];status?:string}){
 const added=(values.receipts??[]).filter(r=>!p.receipts.some(old=>old.id===r.id));
 if(added.length)await tx.insert(paymentReceipt).values(added.map(r=>({id:r.id,talentId:p.talentId,paymentId:p.id,receivedOn:r.date,cash:r.cash,withheld:r.withheld,replacesId:r.replaces??r.replacesId??null,withdrawn:!!r.withdrawn,note:r.note||null,recordedBy:r.recordedBy??null,...(r.recordedAt?{createdAt:new Date(r.recordedAt)}:{})})));
 if(values.status==="expected"||values.status==="settled")await tx.update(payment).set({status:values.status}).where(and(eq(payment.id,p.id),eq(payment.talentId,p.talentId)));
}
