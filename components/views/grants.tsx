"use client";
import { ExternalLink, Plus, RefreshCw, Bell, CalendarDays, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageLoader, useCursorPages } from "@/components/app/cursor-pages";
import { useAppData } from "@/components/app/app-data";
import { useState, useTransition } from "react";
import { useRealWorkspace } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { DateTimeInput } from "@/components/app/date-time-input";
import { TimeZonePicker } from "@/components/app/time-zone-picker";
import { type GrantAvailabilityFilter } from "@/lib/grants/list";
import { GrantSubmissionSummary } from "./grant-submission-summary";
import { Toast } from "@/components/app/toast";
import { useRouter } from "next/navigation";
import { grantSubmissionTask } from "@/lib/grants/submission";
import { Modal } from "@/components/app/modal";
import { refreshGrants, saveGrant, updateGrant, addGrantTask, updateGrantTask, setGrantWatch, markGrantsSeen } from "@/lib/actions/grants";
import { setTodoDone } from "@/lib/actions/calendar";
import { grantRegions, grantStages, grantTaskKinds, type GrantApplication, type GrantOpportunity, type GrantWorkspace } from "@/lib/grants/types";
import { grantAvailability } from "@/lib/grants/availability";
import { dateInZone } from "@/lib/domain/dates";
import { isSigned } from "@/lib/domain/phases";
import type { ProjectSummary } from "@/lib/types";

export function GrantsView({workspace,projects,timeZone,initialOpportunityId=""}:{workspace:GrantWorkspace;projects:ProjectSummary[];timeZone:string;initialOpportunityId?:string}) {
  const t=useTranslations("grants");
  const tPage=useTranslations("pagination");
  const [region,setRegion]=useState(workspace.opportunities.find(g=>g.id===initialOpportunityId)?.region||(timeZone==="Asia/Taipei"?"TW":"all"));
  const [scope,setScope]=useState<"discover"|"mine">(initialOpportunityId?"mine":"discover");
  const [query,setQuery]=useState("");
  const [availability,setAvailability]=useState<GrantAvailabilityFilter>("active");
  const [selected,setSelected]=useState<string|null>(initialOpportunityId||null);
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState<string|null>(null);
  const [status,setStatus]=useState("");
  const [watch,setWatch]=useState(false);
  const run=(action:()=>Promise<string|null>,success=t("saved"))=>startTransition(async()=>{setError(null);try{const failure=await action();setError(failure);if(!failure)setStatus(success);}catch{setError(t("failed"));}});
  const today=dateInZone(timeZone);
  const data=useAppData();
  const page=useCursorPages<GrantOpportunity>(`/api/grants?${new URLSearchParams({region,scope,q:query,availability})}`, `${data.person.email}:${data.talent.id}`, workspace);
  const filtered=page.items;
  // Keep the selected detail open when filters/page data refresh after a save.
  const [opened,setOpened]=useState<GrantOpportunity|null>(null);

  const clearFilters=()=>{setQuery("");setRegion("all");setAvailability("active");setSelected(null);};
  const current=workspace.opportunities.find(g=>g.id===selected)||filtered.find(g=>g.id===selected)||(opened?.id===selected?opened:null);
  const application=workspace.applications.find(a=>a.opportunityId===selected);
  return <div className="grants-workspace">
    <div className="grant-toolbar">
      <div className="grant-tabs" role="group" aria-label={t("view")}>
        {(["discover","mine"] as const).map(s=><button type="button" key={s} aria-pressed={scope===s} className={scope===s?"primary":"secondary"} onClick={()=>{setScope(s);setSelected(null);}}>{t(s)}</button>)}
      </div>
      <div className="grant-tools">
        <InfoHint label={t("about")} notes={[t("aboutText"),t("coverage"),t("eligibilityHint")]} />
        <button type="button" className="secondary" disabled={pending} onClick={()=>run(refreshGrants,t("refreshed"))}><RefreshCw size={16} aria-hidden="true"/>{t("refresh")}</button>
        <button type="button" className="secondary" onClick={()=>setWatch(true)}><Bell size={16} aria-hidden="true"/>{t(workspace.watch.enabled?"watchSettings":"watchEnable")}</button>
      </div>
    </div>
    <div className="grant-filters">
      <label className="grant-search"><span className="sr-only">{t("search")}</span><input type="search" placeholder={t("search")} value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);}}/></label>
      <label><span className="sr-only">{t("region")}</span><select aria-label={t("region")} value={region} onChange={e=>{setRegion(e.target.value);setSelected(null);}}><option value="all">{t("allRegions")}</option>{grantRegions.map(r=><option key={r} value={r}>{t(`regions.${r}`)}</option>)}</select></label>
      {scope==="discover"&&<label><span className="sr-only">{t("availabilityFilter")}</span><select aria-label={t("availabilityFilter")} value={availability} onChange={e=>{setAvailability(e.target.value as GrantAvailabilityFilter);setSelected(null);}}>{(["active","open","upcoming","check","closed","all"] as const).map(state=><option key={state} value={state}>{t(state==="active"?"activeListings":state==="all"?"allStatuses":`availability.${state}`)}</option>)}</select></label>}
    </div>
    <div className="grant-list-summary"><span role="status">{page.total===null?(page.failed?tPage("failed"):tPage("loading")):t("resultCount",{count:page.total})}</span><details className="grant-source-status"><summary>{t("sourceStatus")}{workspace.sources.some(s=>s.failed)&&` · ${t("sourceFailed")}`}</summary><div className="grant-source-line">{workspace.sources.map(s=><span key={s.id}>{t(`sources.${s.id}`)} · {s.failed?t("sourceFailed"):s.checkedAt?t("checkedDate",{date:s.checkedAt.slice(0,10)}):t("notChecked")}</span>)}</div></details></div>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <p className="sr-only" role="status">{status}</p>
    <div className={`grant-columns ${current?"has-selection":""}`}>
      <section className="grant-list" aria-label={t(scope)}>
        {filtered.length?filtered.map(g=>{
          const state=grantAvailability(g,dateInZone(g.region==="TW"?"Asia/Taipei":timeZone));
          const app=workspace.applications.find(a=>a.opportunityId===g.id);
          return <button type="button" className={`grant-list-item ${selected===g.id?"selected":""}`} key={g.id} aria-pressed={selected===g.id} onClick={()=>{setOpened(g);setSelected(g.id);}}>
            <span className="grant-card-header"><span className="grant-card-source"><span>{t(`regions.${g.region}`)}</span><span aria-hidden="true">·</span><span>{g.region==="TW"?t("sources.moc"):g.agency}</span></span><span className={`grant-state ${state}`}>{t(`availability.${state}`)}</span></span>
            <strong className="grant-card-title">{g.title}</strong>
            <span className="grant-card-deadline"><CalendarDays size={14} aria-hidden="true"/>{g.closesOn?t("deadlineDate",{date:g.closesOn}):t("deadlineUnknown")}</span>
            {app&&<span className="grant-card-footer"><span className="grant-saved">{t(`stages.${app.stage}`)}</span><GrantSubmissionSummary application={app} compact/></span>}
          </button>;
        }):!page.loading&&!page.failed&&<div className="grant-empty"><h2>{t(scope==="mine"&&!workspace.applications.length?"emptyMine":"empty")}</h2><button type="button" className="secondary" onClick={()=>scope==="mine"&&!workspace.applications.length?(setScope("discover"),clearFilters()):clearFilters()}>{t(scope==="mine"&&!workspace.applications.length?"discover":"clearFilters")}</button></div>}
        <PageLoader page={page}/>
      </section>
      {current?<section className="grant-detail" aria-label={current.title}>
        <div className="grant-detail-top"><span className="grant-source-tag">{t(`regions.${current.region}`)}</span><button type="button" className="icon-button" aria-label={t("close")} onClick={()=>setSelected(null)}><X size={18} aria-hidden="true"/></button></div>
        <h2>{current.title}</h2>
        <dl className="grant-dates"><div><dt>{t("opens")}</dt><dd>{current.opensOn||t("unknown")}</dd></div><div><dt>{t("deadline")}</dt><dd>{current.closesOn||t("unknown")}</dd></div></dl>
        <div className="grant-detail-actions"><a className="secondary" href={current.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true"/>{t("official")}</a></div>
        {!application&&<SaveGrantPlan key={current.id} opportunity={current} timeZone={timeZone} pending={pending} run={run}/>}
        {application&&<ApplicationPanel key={application.id} application={application} opportunity={current} projects={projects} timeZone={timeZone} today={today} pending={pending} run={run}/>}
        <details className="grant-reference"><summary>{t("requirements")}</summary><p>{t("eligibilityHint")}</p>{current.summary&&<p>{current.summary}</p>}<p>{t("dateHint")}</p><p>{t("checkedDate",{date:current.checkedAt.slice(0,10)})}</p></details>

      </section>:<aside className="grant-guide"><h2>{t("guideTitle")}</h2><ol><li>{t("guideDiscover")}</li><li>{t("guidePrepare")}</li><li>{t("guideConnect")}</li></ol></aside>}
    </div>
    {watch&&<WatchDialog workspace={workspace} onClose={()=>setWatch(false)} run={run} pending={pending}/>}
  </div>;
}

function SaveGrantPlan({opportunity:g,timeZone,pending,run}:{opportunity:GrantOpportunity;timeZone:string;pending:boolean;run:(action:()=>Promise<string|null>,success?:string)=>void}) {
  const t=useTranslations("grants");
  const [date,setDate]=useState("");
  const [time,setTime]=useState("");
  const [zone,setZone]=useState(g.region==="TW"?"Asia/Taipei":timeZone);
  return <form className="grant-save-plan" onSubmit={e=>{e.preventDefault();run(()=>saveGrant(g.id,date?{date,time,timeZone:zone}:undefined),t(date?"addedToCalendar":"saved"));}}>
    <div className="grant-section-title"><h3>{t("planSubmission")}</h3><InfoHint label={t("planSubmission")} notes={[t("planHint"),t("dateHint")]}/></div>
    <div className="grant-form-grid"><DateTimeInput kind="date" label={t("plannedSubmission")} value={date} onChange={setDate} today={dateInZone(zone)}/><DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={dateInZone(zone)}/></div>
    {date&&<TimeZonePicker label={t("timeZone")} required value={zone} onChange={setZone}/>}
    {date&&g.closesOn&&date>g.closesOn&&<p className="notice" role="status">{t("afterDeadline")}</p>}
    <button type="submit" className="primary" disabled={pending||(!date&&!!time)}>{t(date?"saveAndSchedule":"save")}</button>
  </form>;
}

function ApplicationPanel({application:a,opportunity:g,projects,timeZone,today,pending,run}:{application:GrantApplication;opportunity:GrantOpportunity;projects:ProjectSummary[];timeZone:string;today:string;pending:boolean;run:(action:()=>Promise<string|null>,success?:string)=>void}) {
  const t=useTranslations("grants");
  const openRealWorkspace=useRealWorkspace();
  const [stage,setStage]=useState(a.stage);
  const [projectId,setProjectId]=useState(a.projectId||"");
  const [notes,setNotes]=useState(a.notes);
  const [adding,setAdding]=useState(false);
  const [editingTask,setEditingTask]=useState<GrantApplication["tasks"][number]|null>(null);
  const [savedDate,setSavedDate]=useState("");
  const router=useRouter();
  const submission=grantSubmissionTask(a.tasks);
  return <div className="grant-application">
    <div className="grant-section-title"><h3>{t("application")}</h3><InfoHint label={t("application")} notes={[t("applicationHint"),t("paymentHint")]}/></div>
    <GrantSubmissionSummary application={a} onSchedule={()=>{setSavedDate("");setAdding(true);}}/>
    <details className="grant-reference grant-application-details"><summary>{t("applicationDetails")}<span className="grant-saved">{t(`stages.${a.stage}`)}</span></summary><form onSubmit={e=>{e.preventDefault();run(()=>updateGrant({id:a.id,stage,projectId,notes}));}}>
      <div className="grant-form-grid"><label>{t("stage")}<select value={stage} onChange={e=>setStage(e.target.value as typeof stage)}>{grantStages.map(s=><option key={s} value={s}>{t(`stages.${s}`)}</option>)}</select></label><label>{t("project")}<select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">{t("noProject")}</option>{projects.filter(p=>(!p.archived&&isSigned(p.stage))||p.id===a.projectId).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div>
      <details className="grant-reference"><summary>{t("notes")}</summary><label><span className="sr-only">{t("notes")}</span><textarea value={notes} maxLength={10000} onChange={e=>setNotes(e.target.value)} rows={3}/></label></details>
      <button type="submit" className="secondary" disabled={pending}>{t("saveChanges")}</button>
    </form></details>
    <div className="grant-section-title"><h3>{t("checklist")}</h3><InfoHint label={t("checklist")} notes={[t("checklistHint"),t("dateHint")]}/></div>
    {!a.tasks.some(task=>task.status==="open")&&<p className="muted">{t("noOpenTasks")}</p>}
    <GrantTaskList tasks={a.tasks.filter(task=>task.status==="open")} pending={pending} run={run} onEdit={task=>{setSavedDate("");setEditingTask(task);}}/>
    {a.tasks.some(task=>task.status==="done")&&<details className="grant-reference"><summary>{t("completedTasks",{count:a.tasks.filter(task=>task.status==="done").length})}</summary><GrantTaskList tasks={a.tasks.filter(task=>task.status==="done")} pending={pending} run={run} onEdit={task=>{setSavedDate("");setEditingTask(task);}}/></details>}
    <button type="button" className="secondary" onClick={()=>{setSavedDate("");setAdding(true);}}><Plus size={16} aria-hidden="true"/>{t("addTask")}</button>
    <div className="grant-links"><Link href={submission?.date?`/calendar?date=${submission.date}`:"/calendar"} onClick={openRealWorkspace}>{t("calendar")}</Link>{a.projectId&&<><Link href={`/projects?id=${a.projectId}`} onClick={openRealWorkspace}>{t("openProject")}</Link><Link href="/finance" onClick={openRealWorkspace}>{t("finance")}</Link></>}</div>
    {(adding||editingTask)&&<TaskDialog task={editingTask||undefined} opportunityTitle={g.title} applicationId={a.id} defaultDate={g.closesOn&&g.closesOn>=today?g.closesOn:today} defaultZone={g.region==="TW"?"Asia/Taipei":timeZone} onClose={()=>{setAdding(false);setEditingTask(null);}} onSaved={setSavedDate} run={run} pending={pending}/>}
    {savedDate&&<Toast message={t("addedToCalendar")} action={{label:t("calendar"),onClick:()=>{openRealWorkspace();router.push(`/calendar?date=${savedDate}`);}}} onClose={()=>setSavedDate("")}/>}
  </div>;
}
function GrantTaskList({tasks,pending,run,onEdit}:{tasks:GrantApplication["tasks"];pending:boolean;run:(action:()=>Promise<string|null>,success?:string)=>void;onEdit:(task:GrantApplication["tasks"][number])=>void}) {
  const t=useTranslations("grants");
  return <ul className="grant-tasks">{[...tasks].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")||(a.time||"").localeCompare(b.time||"")).map(task=>{
    const overdue=task.status==="open"&&!!task.date&&task.date<dateInZone(task.timeZone);
    return <li key={task.id}><label><input type="checkbox" checked={task.status==="done"} disabled={pending} onChange={e=>run(()=>setTodoDone(task.id,e.target.checked))}/><span className={task.status==="done"?"grant-done":""}>{task.title}</span></label><span className={`grant-task-date ${overdue?"overdue":""}`}>{overdue&&<strong>{t("overdue")}</strong>}<button type="button" className="grant-task-date-button" aria-label={t("editTaskNamed",{title:task.title})} onClick={()=>onEdit(task)}>{task.date}{task.time&&` ${task.time}`}</button><InfoHint label={t("timeZone")} notes={[task.timeZone]}/></span></li>;
  })}</ul>;
}
function TaskDialog({opportunityTitle,applicationId,defaultDate,defaultZone,onClose,onSaved,task,run,pending}:{task?:GrantApplication["tasks"][number];onSaved:(date:string)=>void;opportunityTitle:string;applicationId:string;defaultDate:string;defaultZone:string;onClose:()=>void;run:(action:()=>Promise<string|null>,success?:string)=>void;pending:boolean}) {
  const t=useTranslations("grants");
  const [kind,setKind]=useState<(typeof grantTaskKinds)[number]>(task?.kind||"submission");
  const taskTitle=(kind:(typeof grantTaskKinds)[number])=>`${t(`tasks.${kind}`)} · ${opportunityTitle}`.slice(0,200);
  const [title,setTitle]=useState(task?.title||taskTitle("submission"));
  const [date,setDate]=useState(task?.date||defaultDate);
  const [time,setTime]=useState(task?.time||"");
  const [zone,setZone]=useState(task?.timeZone||defaultZone);
  const [error,setError]=useState<string|null>(null);
  const [requestId]=useState(()=>crypto.randomUUID());
  return <Modal title={t(task?"editTask":"addTask")} onClose={onClose}>
    <form className="editor-form" onSubmit={e=>{e.preventDefault();run(async()=>{const values={applicationId,kind,title,date,time,timeZone:zone};const failure=task?await updateGrantTask({...values,taskId:task.id}):await addGrantTask({...values,requestId});setError(failure);if(!failure){onSaved(date);onClose();}return failure;});}}>
      <label>{t("taskKind")}<select value={kind} onChange={e=>{const k=e.target.value as typeof kind;if(title===taskTitle(kind))setTitle(taskTitle(k));setKind(k);}}>{grantTaskKinds.map(k=><option key={k} value={k}>{t(`tasks.${k}`)}</option>)}</select></label>
      <label>{t("taskTitle")}<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <div className="grant-form-grid"><DateTimeInput kind="date" label={t("date")} required value={date} onChange={setDate} today={dateInZone(zone)}/><DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={dateInZone(zone)}/></div>
      <TimeZonePicker label={t("timeZone")} required value={zone} onChange={setZone}/>
      <div className="grant-form-note"><InfoHint label={t("date")} notes={[t("dateHint")]}/></div>{error&&<p role="alert" className="notice error">{error}</p>}
      <footer className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary" disabled={pending}>{t(task?"saveChanges":"saveTask")}</button></footer>
    </form>
  </Modal>;
}
function WatchDialog({workspace,onClose,run,pending}:{workspace:GrantWorkspace;onClose:()=>void;run:(action:()=>Promise<string|null>,success?:string)=>void;pending:boolean}) {
  const t=useTranslations("grants");
  const [enabled,setEnabled]=useState(workspace.watch.enabled);
  const [regions,setRegions]=useState(workspace.watch.regions);
  const [error,setError]=useState<string|null>(null);
  return <Modal title={t("watchSettings")} onClose={onClose} narrow><form className="editor-form" onSubmit={e=>{e.preventDefault();run(async()=>{const failure=await setGrantWatch(enabled,regions);setError(failure);if(!failure)onClose();return failure;});}}>
    <label className="grant-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{t("watchEnable")}</label>
    <fieldset><legend>{t("region")}</legend>{grantRegions.map(r=><label className="grant-check" key={r}><input type="checkbox" checked={regions.includes(r)} onChange={e=>setRegions(e.target.checked?[...regions,r]:regions.filter(x=>x!==r))}/>{t(`regions.${r}`)}</label>)}</fieldset>
    <p className="muted">{t("watchHint")}</p>{error&&<p role="alert">{error}</p>}<footer className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t("cancel")}</button><button type="submit" className="primary" disabled={pending||!regions.length}>{t("saveChanges")}</button></footer>
  </form></Modal>;
}
export function GrantNotice({count}:{count:number}) {
  const t=useTranslations("grants");
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState<string|null>(null);
  if(!count)return null;
  return <aside className="grant-notice"><Bell size={18} aria-hidden="true"/><Link href="/grants">{t("newNotices",{count})}</Link><button className="text-button" disabled={pending} onClick={()=>startTransition(async()=>{try{setError(await markGrantsSeen());}catch{setError(t("failed"));}})}>{t("markSeen")}</button>{error&&<span role="alert">{error}</span>}</aside>;
}
