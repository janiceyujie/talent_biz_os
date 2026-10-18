import {managerDateRange, ManagerScopeError} from "./scope";
import {supportedCurrencies, type Currency} from "@/lib/domain/money";
export type WorkspaceQuery={view:"all"|"calendar"|"finance"|"reminders"|"today";start?:string;end?:string;currency?:Currency};
export function workspaceQuery(params:URLSearchParams):WorkspaceQuery {
  const view=params.get("view")||"all";
  if(!["all","calendar","finance","reminders","today"].includes(view))throw new ManagerScopeError("invalid");
  const start=params.get("start")||undefined,end=params.get("end")||undefined,currency=params.get("currency")||undefined;
  if((start&&!end)||(!start&&end))throw new ManagerScopeError("invalid");
  if(start&&end){
    if(view==="finance") {managerDateRange(start,start);managerDateRange(end,end);if(start>end)throw new ManagerScopeError("invalid");}
    else managerDateRange(start,end);
  }
  if(view==="calendar"&&(!start||!end))throw new ManagerScopeError("invalid");
  if(currency&&!supportedCurrencies.includes(currency as Currency))throw new ManagerScopeError("invalid");
  return {view:view as WorkspaceQuery["view"],start,end,currency:currency as Currency|undefined};
}
/** One-week padding covers adjacent display days and cross-zone midnight boundaries. */
export function calendarLoadRange(date:string) {
  managerDateRange(date,date);
  const first=new Date(`${date.slice(0,7)}-01T12:00:00Z`);
  const last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(7);
  first.setUTCDate(-6);
  return {start:first.toISOString().slice(0,10),end:last.toISOString().slice(0,10)};
}
