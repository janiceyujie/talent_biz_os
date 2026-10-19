"use client";
import { paymentRemaining } from "@/lib/domain/workflow";
import { ActionNotice } from "@/components/app/action-notice";
import {useEffect,useRef,useState} from "react";
import {useFormatter,useTranslations} from "next-intl";
import {ArrowLeft} from "lucide-react";
import type {ProjectSummary} from "@/lib/types";
import type {ManagerProjectData} from "@/lib/manager/project-types";
import {useLabels} from "@/lib/i18n/labels";
import {useMoney} from "@/lib/i18n/format";
import {projectQuoteTotal,paymentCash} from "@/lib/domain/workflow";
import {InfoHint} from "@/components/app/info-hint";
type Tab="overview"|"calendar"|"money"|"contracts"|"timeline";
export function PortfolioProjectDetail({project,onBack}:{project:ProjectSummary;onBack:()=>void}){
  const t=useTranslations("portfolioProjects"),labels=useLabels(),money=useMoney(),format=useFormatter();
  const key=`${project.artistId}:${project.id}:${project.updatedAt}`;
  const [state,setState]=useState<{key:string;data?:ManagerProjectData;failed?:boolean}>();
  const [tab,setTab]=useState<Tab>("overview"),[revision,setRevision]=useState(0);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(window.matchMedia("(max-width:1000px)").matches)heading.current?.focus();},[]);
  useEffect(()=>{
    if(!project.artistId)return;
    const abort=new AbortController();
    fetch(`/api/manager/projects/${project.id}?artist=${project.artistId}`,{signal:abort.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw Error();const data=await response.json() as ManagerProjectData;if(!abort.signal.aborted)setState({key,data});}).catch(()=>{if(!abort.signal.aborted)setState({key,failed:true});});
    return ()=>abort.abort();
  },[key,revision,project.artistId,project.id]);
  const current=state?.key===key?state:undefined,data=current?.data;
  const quote=projectQuoteTotal(project);
  const full=data?.project;
  const fields=full?[[t("deliverables"),full.details.deliverables],[t("rights"),full.details.rights],[t("travel"),full.details.travel],[t("contractNotes"),full.details.contractNotes],...Object.entries(full.details.fields||{}).map(([name,value])=>[labels.detailField(full.type,name),value])].filter(([,value])=>value):[];
  return <article className="deal-detail deal-dossier portfolio-project-detail">
    <section className="surface dossier-box"><button className="text-button deal-back" onClick={onBack}><ArrowLeft size={16}/>{t("back")}</button><span className="portfolio-record-artist">{project.artist}</span><h2 ref={heading} tabIndex={-1}>{project.title}</h2><div className="portfolio-project-meta"><span>{project.counterparty}</span><span>{labels.stage(project.stage)}</span><span>{labels.projectType(project.type)}</span><strong>{quote===null?t("quoteUnset"):money(quote,project.currency)}</strong><InfoHint label={t("readOnly")} notes={[t("readOnlyHint")]}/></div>{project.nextAction&&<p>{t("next")}: {project.nextAction.title} {project.nextAction.dueDate}</p>}</section>
    <section className="surface dossier-box"><div className="portfolio-project-tabs" role="group" aria-label={t("tabs")}>{(["overview","calendar","money","contracts","timeline"] as const).map(value=><button key={value} className={tab===value?"primary compact":"secondary compact"} aria-pressed={tab===value} onClick={()=>setTab(value)}>{t(value)}</button>)}</div>
      {!current&&<p role="status" aria-busy="true">{t("loading")}</p>}
      {current?.failed&&<ActionNotice className="error" role="alert" actions={<button className="text-button" onClick={()=>{setState(undefined);setRevision(value=>value+1);}}>{t("retry")}</button>}>{t("failed")}</ActionNotice>}
      {data&&<>
        {tab==="overview"&&<div className="portfolio-detail"><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!!full?.details.toConfirm?.length&&<section><h3>{t("confirm")}</h3><ul>{full.details.toConfirm.map((value,index)=><li key={index}>{value}</li>)}</ul></section>}{full?.notes&&<section><h3>{t("notes")}</h3><p className="portfolio-pre-wrap">{full.notes}</p></section>}{data.detail.offerText&&<details><summary>{t("offer")}</summary><p className="portfolio-pre-wrap">{data.detail.offerText}</p></details>}{!fields.length&&!full?.notes&&!data.detail.offerText&&!full?.details.toConfirm?.length&&<p className="empty">{t("empty")}</p>}</div>}
        {tab==="calendar"&&<div>{data.calendar.filter(row=>!row.archived).map(row=><div className="portfolio-schedule-row" key={`${row.source}:${row.id}`}><strong>{row.title}</strong><time>{row.date} {row.time}<small>{row.timeZone}</small></time><span>{row.done?t("done"):labels.calendarKind(row.kind)}</span></div>)}{full?.details.dates?.map((row,index)=><div className="portfolio-schedule-row" key={index}><strong>{row.what}</strong><time>{row.date} {row.time}<small>{row.timeZone}</small></time></div>)}{!data.calendar.some(row=>!row.archived)&&!full?.details.dates?.length&&<p className="empty">{t("empty")}</p>}</div>}
        {tab==="money"&&<div>{data.payments.filter(row=>!row.voided).map(row=><div className="portfolio-schedule-row" key={row.id}><strong>{row.label}</strong><span>{labels.direction(row.direction)} · {labels.paymentStatus(row)}</span><span>{money(paymentRemaining(row)>0?paymentRemaining(row):paymentCash(row),row.currency)}</span><time>{row.settledDate||row.dueDate||row.recordedDate}</time></div>)}{!data.payments.some(row=>!row.voided)&&<p className="empty">{t("empty")}</p>}</div>}
        {tab==="contracts"&&<div>{data.contracts.map(row=><details className="portfolio-contract-version" key={row.id}><summary>{t("version",{version:row.version})} · {t(`contractStatus.${row.status}`)}</summary><dl>{row.terms.fee!==null&&<div><dt>{t("fee")}</dt><dd>{money(row.terms.fee,project.currency)}</dd></div>}{row.terms.paymentTerms&&<div><dt>{t("paymentTerms")}</dt><dd>{row.terms.paymentTerms}</dd></div>}{row.terms.keyTerms&&<div><dt>{t("keyTerms")}</dt><dd>{row.terms.keyTerms}</dd></div>}{Object.entries(row.terms.fields).map(([name,value])=><div key={name}><dt>{labels.detailField(project.type,name)}</dt><dd>{value}</dd></div>)}</dl></details>)}{!data.contracts.length&&<p className="empty">{t("empty")}</p>}</div>}
        {tab==="timeline"&&<div>{data.detail.timeline.map(row=><details className="portfolio-contract-version" key={row.messageId}><summary>{format.dateTime(new Date(row.receivedAt),{dateStyle:"medium"})} · {row.title}</summary>{row.summary&&<p>{row.summary}</p>}{row.stage&&<p>{labels.stage(row.stage.from)} → {labels.stage(row.stage.to)}</p>}</details>)}{!data.detail.timeline.length&&<p className="empty">{t("empty")}</p>}</div>}
      </>}
    </section>
  </article>;
}
