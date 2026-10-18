import { minorUnits, minorUnitFactor, type Currency } from "@/lib/domain/money";
import { cashInRange, paymentBalance, type PaymentBalanceSource } from "@/lib/domain/payment-receipts";
import type { ManagerOverview } from "./types";
type Row = PaymentBalanceSource & {talentId:string;direction:string;voidedAt:Date|null;dueOn?:string|null;recordedOn?:string};
/** Keep cash, withholding and outstanding amounts distinct for each artist and currency. */
export function managerFinance(rows:Row[], from="", to="9999-12-31"):ManagerOverview["finance"] {
  const totals=new Map<string,{artistId:string;currency:Currency;received:number;paid:number;receivable:number;payable:number}>();
  for(const row of rows) {
    if(row.voidedAt || row.status==="cancelled")continue;
    const key=`${row.talentId}:${row.currency}`;
    const group=totals.get(key)||{artistId:row.talentId,currency:row.currency as Currency,received:0,paid:0,receivable:0,payable:0};
    const balance=paymentBalance(row), due=row.dueOn??row.recordedOn??"";
    group[row.direction==="in"?"received":"paid"]+=minorUnits(cashInRange(row,from,to),row.currency);
    if(due>=from&&due<=to)group[row.direction==="in"?"receivable":"payable"]+=minorUnits(balance.remaining,row.currency);
    totals.set(key,group);
  }
  return [...totals.values()].map(group=>{const factor=minorUnitFactor(group.currency);return {...group,received:group.received/factor,paid:group.paid/factor,receivable:group.receivable/factor,payable:group.payable/factor};});
}
