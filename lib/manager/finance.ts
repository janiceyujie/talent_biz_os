import {minorUnits,minorUnitFactor,quote,type Currency} from "@/lib/domain/money";
import type {ManagerOverview} from "./types";
type Row={covered?:number;inRange?:boolean;talentId:string;currency:string;amount:number;settledAmount:number|null;direction:string;status:string;taxRate:number;taxIncluded:boolean;voidedAt:Date|null};
/** Keep each artist and currency separate; expected money is not cash received. */
export function managerFinance(rows:Row[]):ManagerOverview["finance"] {
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
    const column=row.status==="settled"?(row.direction==="in"?"received":"paid"):(row.direction==="in"?"receivable":"payable");
    const value=row.status==="settled" && row.settledAmount!==null?row.settledAmount:quote(row.amount,row.taxRate,row.taxIncluded,row.currency).total;
    group[column]+=minorUnits(value,row.currency);totals.set(key,group);
  }
  return [...totals.values()].map(group=>{const factor=minorUnitFactor(group.currency);return {...group,received:group.received/factor,paid:group.paid/factor,receivable:group.receivable/factor,payable:group.payable/factor};});
}
