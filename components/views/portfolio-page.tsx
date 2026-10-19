"use client";
import { ActionNotice } from "@/components/app/action-notice";
import {ManagerReadBoundary} from "@/components/app/manager-read-boundary";
import {type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {AppDataScope,useAppData} from "@/components/app/app-data";
import {usePortfolio,usePortfolioWorkspace} from "@/components/app/portfolio-provider";
import {PortfolioToday} from "./portfolio-today";
import {FinanceView} from "./finance";
import {PlannerView} from "./planner";
export function PortfolioPage({view,children,initialDay="",initialDate=""}:{view:"today"|"calendar"|"finance";children?:ReactNode;initialDay?:string;initialDate?:string}) {
  const own=useAppData(),scope=usePortfolio(),resource=usePortfolioWorkspace(),t=useTranslations("portfolio");
  if(resource.hydrating)return <div className="portfolio-loading surface" role="status" aria-busy="true">{t("loading")}</div>;
  if(!resource.active)return children;
  const portfolio=resource.data;
  const hidden=resource.loading||!!resource.error||!!portfolio?.limited||!scope?.ids?.length;
  // Keep date/view/currency filters mounted, but never show stale artist records while scope changes.
  const data={...own,preview:false,previewDate:undefined,calendar:portfolio?.calendar||[],payments:portfolio?.payments||[],projects:portfolio?.projects||[],externalEvents:[],googleCalendar:{...own.googleCalendar,importing:[]},portfolio:{artists:portfolio?.artists.filter(artist=>portfolio.selectedIds.includes(artist.id))||[]}};
  return <ManagerReadBoundary ids={scope?.ids||[]}>
    {resource.loading&&<div className="portfolio-loading surface" role="status" aria-busy="true">{t("loading")}</div>}
    {resource.error&&<ActionNotice className="error" role="alert" actions={<button className="secondary compact" onClick={resource.retry}>{t("retry")}</button>}>{resource.error}</ActionNotice>}
    {portfolio?.limited&&<ActionNotice role="status">{t("limited")}</ActionNotice>}
    {!resource.loading&&!resource.error&&!portfolio?.limited&&!scope?.ids?.length&&<p className="empty">{t("choose")}</p>}
    <div hidden={hidden} inert={hidden}><AppDataScope data={data}>
      {view==="today"?<PortfolioToday/>:view==="finance"?<FinanceView readOnly/>:<PlannerView initialDay={initialDay} initialDate={initialDate} readOnly/>}
    </AppDataScope></div>
  </ManagerReadBoundary>;
}
