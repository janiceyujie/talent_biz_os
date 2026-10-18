"use client";
import {ManagerReadBoundary} from "@/components/app/manager-read-boundary";
import Link from "next/link";
import {portfolioLink} from "@/lib/manager/selection";
import {useLocale,useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useState,useTransition} from "react";
import {DateTimeInput} from "@/components/app/date-time-input";
import {ConfirmDialog} from "@/components/app/confirm-dialog";
import {InfoHint} from "@/components/app/info-hint";
import {respondManagerInvitation,leaveManagerArtist} from "@/lib/actions/manager";
import {dateInZone} from "@/lib/domain/dates";
import {money} from "@/lib/domain/money";
import {MAX_MANAGED_ARTISTS} from "@/lib/manager/scope";
import type {ManagerOverview} from "@/lib/manager/types";
import {ManagerCalendar} from "./manager-calendar";
type Tab="calendar"|"messages"|"finance";
export function ManagerDashboard({data,invitations,error,initialTab="calendar"}:{data:ManagerOverview;invitations:{id:string;name:string}[];error?:string;initialTab?:Tab}) {
  const tPortfolio=useTranslations("portfolio");
  const t=useTranslations("manager"),locale=useLocale(),router=useRouter();
  const [ids,setIds]=useState(data.selectedIds),[start,setStart]=useState(data.start),[end,setEnd]=useState(data.end);
  const [tab,setTab]=useState<Tab>(initialTab),[failure,setFailure]=useState(error||"");
  const [pending,transition]=useTransition();
  const [leaving,setLeaving]=useState<string|null>(null);
  const filter=(selected:string[],from=start,to=end,view=tab)=>transition(()=>{
    const params=new URLSearchParams({start:from,end:to,view});if(!selected.length)params.set("artist","none");else selected.forEach(id=>params.append("artist",id));
    router.replace(`/manager?${params.toString()}`,{scroll:false});
  });
  const toggle=(id:string)=>{
    const selected=ids.includes(id)?ids.filter(value=>value!==id):[...ids,id];
    if(selected.length>(data.artistLimit||MAX_MANAGED_ARTISTS))return setFailure(t("limit"));
    setIds(selected);filter(selected);
  };
  const respond=(id:string,accept:boolean)=>transition(async()=>{try{setFailure(await respondManagerInvitation(id,accept)||"");}catch{setFailure(t("failed"));}});
  const name=(id:string)=>data.artists.find(row=>row.id===id)?.name||"";
  const artistTag=(id:string)=><span className={`manager-artist-tag artist-${data.artists.findIndex(row=>row.id===id)%3}`}>{name(id)}</span>;
  return <>
    <div className="manager-heading"><h1>{t("title")}</h1><InfoHint label={t("title")} notes={[t("accessHint"),t("pilotHint")]}/></div>
    {!!data.artists.length&&<div className="row-actions"><Link className="secondary" href={portfolioLink("/",data.selectedIds)}>{tPortfolio("openToday")}</Link><Link className="secondary" href={portfolioLink("/calendar",data.selectedIds)}>{tPortfolio("openCalendar")}</Link><Link className="secondary" href={portfolioLink("/finance",data.selectedIds)}>{tPortfolio("openFinance")}</Link></div>}
    {!!invitations.length&&<section className="manager-invitations" aria-label={t("invitations")}><h2>{t("invitations")}</h2>{invitations.map(row=><div className="manager-invitation" key={row.id}><strong>{row.name}</strong><div><button className="secondary" disabled={pending} onClick={()=>respond(row.id,false)}>{t("decline")}</button><button className="primary" disabled={pending} onClick={()=>respond(row.id,true)}>{t("accept")}</button></div></div>)}</section>}
    {data.limitReached&&<p className="notice" role="status">{t("narrowRange")}</p>}
    {leaving&&<ConfirmDialog title={t("leaveTitle")} confirmLabel={t("leave")} pending={pending} onClose={()=>setLeaving(null)} onConfirm={()=>transition(async()=>{try{const failure=await leaveManagerArtist(leaving);setFailure(failure||"");if(!failure){setLeaving(null);router.replace("/manager");}}catch{setFailure(t("failed"));}})}><p>{t("leaveHint")}</p>{failure&&<p className="notice error" role="alert">{failure}</p>}</ConfirmDialog>}
    {failure&&<p className="notice error" role="alert">{failure}</p>}
    {!data.artists.length?<section className="manager-empty"><h2>{t("empty")}</h2><p>{t("emptyHint")}</p></section>:<>
      <section className="manager-filters" aria-label={t("filter")} aria-busy={pending}>
        <div className="manager-artists"><button className="secondary" disabled={pending} aria-pressed={ids.length===data.artists.length} onClick={()=>{const selected=data.artists.map(row=>row.id);if(selected.length>(data.artistLimit||MAX_MANAGED_ARTISTS))return setFailure(t("limit"));setIds(selected);filter(selected);}}>{t("all")}</button>{data.artists.map((artist,index)=><label key={artist.id} className={`manager-artist-choice artist-${index%3}`}><input type="checkbox" checked={ids.includes(artist.id)} disabled={pending} onChange={()=>toggle(artist.id)}/>{artist.name}</label>)}</div>
        <form className="manager-range" onSubmit={event=>{event.preventDefault();filter(ids,start,end);}}><DateTimeInput kind="date" today={dateInZone("UTC")} label={t("start")} value={start} required onChange={setStart}/><DateTimeInput kind="date" today={dateInZone("UTC")} label={t("end")} value={end} required onChange={setEnd}/><button className="secondary" disabled={pending}>{t("apply")}</button><InfoHint label={t("range")} notes={[t("rangeHint")]}/></form>
      </section>
      <details className="manager-connections"><summary>{t("connections")}</summary>{data.artists.filter(artist=>artist.role==="manager").map(artist=><div className="manager-access-row" key={artist.id}><strong>{artist.name}</strong><button className="secondary" disabled={pending} onClick={()=>setLeaving(artist.id)}>{t("leave")}</button></div>)}</details>
      <ManagerReadBoundary ids={data.selectedIds}>
      <div className="manager-tabs" role="group" aria-label={t("view")}>{(["calendar","messages","finance"] as const).map(view=><button key={view} className={tab===view?"primary":"secondary"} aria-pressed={tab===view} onClick={()=>{setTab(view);filter(ids,start,end,view);}}>{t(view)}</button>)}<span>{t("selected",{count:data.selectedIds.length})}</span></div>
      {!data.selectedIds.length?<p className="manager-empty">{t("chooseArtist")}</p>:<>
        {tab==="calendar"&&<ManagerCalendar items={data.calendar} start={data.start} end={data.end} artistTag={artistTag}/>}
        {tab==="messages"&&<section className="manager-panel" aria-label={t("messages")}><h2>{t("messages")}</h2>{!data.messages.length?<p className="muted">{t("noMessages")}</p>:data.messages.map(row=><details className="manager-message" key={row.id}><summary>{artistTag(row.artistId)}<span>{row.body.trim().split(/\n/)[0]?.slice(0,120)||t("untitled")}</span><time dateTime={row.receivedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(new Date(row.receivedAt))}</time></summary><pre>{row.body}</pre></details>)}</section>}
        {tab==="finance"&&<section className="manager-panel" aria-label={t("finance")}><div className="manager-heading"><h2>{t("finance")}</h2><InfoHint label={t("finance")} notes={[t("financeHint")]}/></div>{!data.finance.length?<p className="muted">{t("noFinance")}</p>:<div className="manager-finance-grid">{data.finance.map(row=><article className="manager-finance-card" key={`${row.artistId}:${row.currency}`}><header>{artistTag(row.artistId)}<span>{row.currency}</span></header><dl>{(["received","paid","receivable","payable"] as const).map(key=><div key={key}><dt>{t(key)}</dt><dd>{money(row[key],locale,row.currency)}</dd></div>)}</dl></article>)}</div>}</section>}
      </>}
      </ManagerReadBoundary>
    </>}
  </>;
}
