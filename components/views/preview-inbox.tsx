"use client";
import Link from "next/link";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {useAppData} from "@/components/app/app-data";
import {InboxReaderLayout} from "@/components/app/inbox-reader-layout";
import {InfoHint} from "@/components/app/info-hint";
import {previewIntakeItems,previewIntakeTab,type PreviewIntakeTab} from "@/lib/domain/preview-intake";
import {IntakeTabs} from "./gmail-intake";
import {MessageDetail} from "./inbox";
export function PreviewInbox(){
 const data=useAppData(),t=useTranslations("intakeDemo"),mail=useTranslations("inbox"),gmail=useTranslations("gmail");
 const [tab,setTab]=useState<PreviewIntakeTab>("messages"),[active,setActive]=useState("");
 const [overrides,setOverrides]=useState<Record<string,PreviewIntakeTab>>({}),[notice,setNotice]=useState("");
 const items=previewIntakeItems(data.inbox,t),visible=items.filter(i=>previewIntakeTab(i,overrides)===tab),selected=items.find(i=>i.message.id===active);
 const counts={messages:0,waiting:0,skipped:0};for(const item of items)counts[previewIntakeTab(item,overrides)]++;
 const name=(value:PreviewIntakeTab)=>gmail(value==="messages"?"tabMessages":value==="waiting"?"tabWaiting":"tabSkipped");
 const move=(destination:PreviewIntakeTab)=>{setOverrides(current=>({...current,[active]:destination}));setTab(destination);setNotice(t("moved",{tab:name(destination)}));};
 const card=(item:typeof items[number])=><div key={item.message.id} className={`mail-item single ${active===item.message.id?"is-active":""}`}><button data-preview-safe="true" className="mail-summary" aria-pressed={active===item.message.id} onClick={()=>setActive(item.message.id)}><small>{name(previewIntakeTab(item,overrides))}</small><strong>{item.message.analysis?.title||item.message.body.split("\n")[0]}</strong><span className="mail-snippet">{(item.message.analysis?.summary||item.message.body).slice(0,110)}</span></button></div>;
 return <div className="inbox-workspace">
  <div className="intake-navigation"><IntakeTabs tab={tab} onTab={next=>{setTab(next);setActive("");setNotice("");}} previewCounts={counts}/><Link className="secondary compact" href="/settings#gmail" data-preview-safe="true">{t("connect")}</Link></div>
  <div className="intake-demo-toolbar" data-preview-safe="true"><span>{t("label")} <InfoHint label={t("label")} notes={[t("hint"),t("connectHint")]}/></span><button className="text-button" onClick={()=>{setOverrides({});setActive("");setTab("messages");setNotice(t("resetDone"));}}>{t("reset")}</button></div>
  {notice&&<p role="status">{notice}</p>}
  <div id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${tab}`}><InboxReaderLayout selectedId={active} selectedCard={selected?card(selected):null} listLabel={mail("listLabel")} list={<><div className="inbox-list-heading"><h2>{name(tab)}</h2><span>{mail("listCount",{count:visible.length})}</span></div>{visible.map(card)}</>}>
   {selected?<><MessageDetail key={active} message={{...selected.message,suggestions:[]}}/><div className="row-actions section-gap" data-preview-safe="true">{tab!=="messages"&&<button className="primary" onClick={()=>move("messages")}>{t(tab==="waiting"?"classifyWork":"restoreWork")}</button>}{tab!=="skipped"&&<button className="secondary" onClick={()=>move("skipped")}>{t("filterOut")}</button>}{tab!=="waiting"&&<button className="text-button" onClick={()=>move("waiting")}>{t("backToWaiting")}</button>}</div></>:<p className="empty">{mail("pick")}</p>}
  </InboxReaderLayout></div>
 </div>;
}
