"use client";
import {useState,useTransition} from "react";
import {useLocale,useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useAppData} from "@/components/app/app-data";
import {PageLoader,useCursorPages} from "@/components/app/cursor-pages";
import {markNotificationsRead} from "@/lib/actions/notifications";
import type {OpportunityChange} from "@/lib/grants/changes";
export function OpportunityChanges({opportunityId,revision,tracked}:{opportunityId:string;revision:number;tracked:boolean}){
 const t=useTranslations("grants"),locale=useLocale(),data=useAppData(),router=useRouter();
 const [open,setOpen]=useState(tracked&&revision>0),[pending,start]=useTransition(),[error,setError]=useState<string|null>(null);
 const [refreshVersion,setRefreshVersion]=useState(0);
 const page=useCursorPages<OpportunityChange&{readAt:string|null}>(`/api/grants/changes?opportunity=${opportunityId}`,`${data.talent.id}:${data.person.email}`,`${revision}:${refreshVersion}`,open);
 return <details className="grant-change-history" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t("changeHistory")}</summary>
 {tracked&&<p className="muted">{t("changePlanHint")}</p>}
 <ol>{page.items.map(row=><li key={row.id}><div><strong>{t(row.kind==="new"?"changeNewShort":"changeDatesShort")}</strong><time dateTime={row.createdAt}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:data.talent.timeZone}).format(new Date(row.createdAt))}</time></div>
 {row.kind==="new"?<p>{t("deadlineDate",{date:row.newClosesOn||t("unknown")})}</p>:<>
 {row.oldOpensOn!==row.newOpensOn&&<p>{t("changeOpening",{before:row.oldOpensOn||t("unknown"),after:row.newOpensOn||t("unknown")})}</p>}
 {row.oldClosesOn!==row.newClosesOn&&<p>{t("changeClosing",{before:row.oldClosesOn||t("unknown"),after:row.newClosesOn||t("unknown")})}</p>}</>}
 {!row.readAt?<button type="button" className="text-button" disabled={pending} onClick={()=>start(async()=>{try{const failure=await markNotificationsRead([`opportunity:${row.id}:${data.talent.id}`]);setError(failure);if(!failure){setRefreshVersion(v=>v+1);router.refresh();}}catch{setError(t("failed"));}})}>{t("markSeen")}</button>:<span className="muted">{t("changeRead")}</span>}</li>)}</ol>
 {!page.loading&&!page.failed&&!page.items.length&&<p className="muted">{t("changeEmpty")}</p>}<PageLoader page={page}/>{error&&<p role="alert">{error}</p>}
 </details>;
}
