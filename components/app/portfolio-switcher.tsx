"use client";
import Link from "next/link";
import {ChevronDown,Users,X} from "lucide-react";
import {useId} from "react";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";
import {usePortfolio} from "./portfolio-provider";
import {InfoHint} from "./info-hint";
import {portfolioPages} from "@/lib/manager/selection";
export function PortfolioSwitcher() {
  const scope=usePortfolio(),path=usePathname(),id=useId(),t=useTranslations("portfolio");
  if(!scope?.capability.enabled||!portfolioPages.includes(path))return null;
  const active=scope.ids!==null,all=active&&scope.ids?.length===scope.artists.length;
  const picked=scope.artists.filter(artist=>scope.ids?.includes(artist.id));
  const summary=active?(all&&picked.length?t("all"):picked.length?t("selection",{name:picked[0].name,count:picked.length-1}):t("none")):t("own");
  return <div className="portfolio-switcher">
    <button type="button" className={`portfolio-switcher-trigger ${active?"is-active":""}`} popoverTarget={id} aria-label={t("scopeLabel",{scope:summary})} title={summary}><Users size={18} aria-hidden="true"/><span>{summary}</span><ChevronDown size={14} aria-hidden="true"/></button>
    <div popover="auto" id={id} className="portfolio-popover" role="dialog" aria-label={t("filter")}>
      <header><strong>{t("filter")}</strong><button className="icon-button" type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={t("close")}><X size={18}/></button></header>
      <div className="portfolio-mode-row"><label htmlFor={`${id}-mode`}>{t("mode")}</label><InfoHint label={t("mode")} notes={[t("modeHint"),t("readOnlyHint")]}/><button id={`${id}-mode`} type="button" className="portfolio-mode-toggle" role="switch" aria-checked={active} aria-label={t("mode")} disabled={!scope.ready} onClick={()=>active?scope.setIds(null):scope.enable()}><span/></button></div>
      {scope.artists.length>scope.capability.artistLimit&&<p className="notice error" role="alert">{t("limit")}</p>}
      {active&&<div className="portfolio-picker"><button type="button" className="secondary compact" aria-pressed={all&&picked.length>0} disabled={!scope.ready||scope.artists.length>scope.capability.artistLimit} onClick={()=>scope.setIds(scope.artists.map(row=>row.id))}>{t("all")}</button>
        {scope.artists.map(artist=><label key={artist.id} title={artist.name}><input type="checkbox" checked={scope.ids?.includes(artist.id)||false} onChange={()=>scope.setIds(scope.ids?.includes(artist.id)?scope.ids.filter(value=>value!==artist.id):[...(scope.ids||[]),artist.id])}/><span>{artist.name}</span></label>)}
        {!scope.artists.length&&<p className="muted">{t("noConnections")}</p>}
      </div>}
      <footer><Link className="text-button" href="/manager">{t("manageConnections")}</Link><InfoHint label={t("filter")} notes={[t("hint"),t("contextHint")]}/></footer>
    </div>
  </div>;
}
