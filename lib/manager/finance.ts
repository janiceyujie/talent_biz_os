import { minorUnits, minorUnitFactor, quote, type Currency } from "@/lib/domain/money";
import { cashInRange, paymentBalance, type PaymentBalanceSource } from "@/lib/domain/payment-receipts";
import type { ManagerOverview } from "./types";
import { isSigned } from "@/lib/domain/phases";
import type { Stage } from "@/lib/types";
type Row = PaymentBalanceSource & {covered?:number;inRange?:boolean;talentId:string;direction:string;voidedAt:Date|null;dueOn?:string|null;recordedOn?:string;projectId?:string|null;projectStage?:Stage};
/** Keep cash, withholding and outstanding amounts distinct for each artist and currency. */
export function managerFinance(rows:Row[], from="", to="9999-12-31"):ManagerOverview["finance"] {
  const totals=new Map<string,{artistId:string;currency:Currency;received:number;paid:number;receivable:number;payable:number}>();
  for(const row of rows) {
    if(row.voidedAt || row.status==="cancelled")continue;
    const key=`${row.talentId}:${row.currency}`;
    const group=totals.get(key)||{artistId:row.talentId,currency:row.currency as Currency,received:0,paid:0,receivable:0,payable:0};
    if(row.covered!==undefined){
      const cash=Number(row.settledAmount??0),remaining=Math.max(0,quote(row.amount,row.taxRate,row.taxIncluded,row.currency).total-Number(row.covered));
      group[row.direction==="in"?"received":"paid"]+=minorUnits(cash,row.currency);
      if(row.status==="expected"&&row.inRange!==false)group[row.direction==="in"?"receivable":"payable"]+=minorUnits(remaining,row.currency);
      totals.set(key,group);continue;
    }
    const balance=paymentBalance(row), due=row.dueOn??row.recordedOn??"";
    group[row.direction==="in"?"received":"paid"]+=minorUnits(cashInRange(row,from,to),row.currency);
    const counted = !row.projectId || (row.projectStage && isSigned(row.projectStage)) || row.status!=="expected" || balance.cash>0 || balance.withheld>0;
    if(counted && row.status==="expected" && due>=from&&due<=to)group[row.direction==="in"?"receivable":"payable"]+=minorUnits(balance.remaining,row.currency);
    totals.set(key,group);
  }
  return [...totals.values()].map(group=>{const factor=minorUnitFactor(group.currency);return {...group,received:group.received/factor,paid:group.paid/factor,receivable:group.receivable/factor,payable:group.payable/factor};});
}
