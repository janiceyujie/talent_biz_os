"use client";
import { ActionNotice } from "@/components/app/action-notice";
import Link from "next/link";
import {ManagerReadBoundary} from "@/components/app/manager-read-boundary";
import {useState,useCallback,type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {AppDataScope,useAppData,useWorkspaceTalent} from "@/components/app/app-data";
import {usePortfolio,usePortfolioWorkspace} from "@/components/app/portfolio-provider";
import {PortfolioToday} from "./portfolio-today";
import {FinanceView} from "./finance";
import {PlannerView} from "./planner";
import {calendarLoadRange} from "@/lib/manager/workspace-query";
import {dateInZone} from "@/lib/domain/dates";
export function PortfolioPage({view,children,initialDay="",initialDate=""}:{view:"today"|"calendar"|"finance";children?:ReactNode;initialDay?:string;initialDate?:string}) {
  const own=useAppData(),workspaceTalent=useWorkspaceTalent(),scope=usePortfolio(),t=useTranslations("portfolio");
  const [window,setWindow]=useState(()=>calendarLoadRange(initialDay||initialDate||dateInZone(workspaceTalent.timeZone)));
  const [finance,setFinance]=useState({currency:"TWD"});
  const onCalendarDate=useCallback((date:string)=>{const next=calendarLoadRange(date);setWindow(previous=>previous.start===next.start?previous:next);},[]);
  const onFinanceFilter=useCallback((_from:string,_to:string,currency:string)=>setFinance(previous=>previous.currency===currency?previous:{currency}),[]);
  const params=new URLSearchParams({view});
  if(view==="calendar"){params.set("start",window.start);params.set("end",window.end);}
  if(view==="finance"){params.set("currency",finance.currency);}
  const resource=usePortfolioWorkspace(params.toString());
  if(resource.hydrating)return <div className="portfolio-loading surface" role="status" aria-busy="true">{t("loading")}</div>;
  if(!resource.active)return children;
  const portfolio=resource.data;
  const hidden=resource.loading||!!resource.error||!!portfolio?.limited||!scope?.ids?.length;
  // Keep date/view/currency filters mounted, but never show stale artist records while scope changes.
  const data={...own,talent:workspaceTalent,preview:false,previewDate:undefined,calendar:portfolio?.calendar||[],payments:portfolio?.payments||[],projects:portfolio?.projects||[],externalEvents:[],googleCalendar:{...own.googleCalendar,importing:[]},portfolio:{artists:portfolio?.artists.filter(artist=>portfolio.selectedIds.includes(artist.id))||[]}};
  return <ManagerReadBoundary ids={scope?.ids||[]}>
    {resource.loading&&<div className="portfolio-loading surface" role="status" aria-busy="true">{t("loading")}</div>}
    {resource.error&&<ActionNotice className="error" role="alert" actions={<button className="secondary compact" onClick={resource.retry}>{t("retry")}</button>}>{resource.error}</ActionNotice>}
    {portfolio?.limited&&<ActionNotice role="status" actions={<Link className="text-button" href={`/manager?view=finance&${new URLSearchParams((scope?.ids||[]).map(id=>["artist",id]))}`}>{t("openManager")}</Link>}>{t("limited")}</ActionNotice>}
    {!resource.loading&&!resource.error&&!portfolio?.limited&&!scope?.ids?.length&&<p className="empty">{t("choose")}</p>}
    <div hidden={hidden} inert={hidden}><AppDataScope data={data}>
      {view==="today"?<PortfolioToday/>:view==="finance"?<FinanceView readOnly onFilterChange={onFinanceFilter}/>:<PlannerView initialDay={initialDay} initialDate={initialDate} readOnly onVisibleDateChange={onCalendarDate}/>}
    </AppDataScope></div>
  </ManagerReadBoundary>;
}
