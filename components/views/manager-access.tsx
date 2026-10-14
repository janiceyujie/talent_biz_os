"use client";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {useState,useTransition} from "react";
import {InfoHint} from "@/components/app/info-hint";
import {ConfirmDialog} from "@/components/app/confirm-dialog";
import {inviteManager,revokeManager} from "@/lib/actions/manager";
export function ManagerAccess({artist,owner,members}:{artist:string;owner:boolean;members:{id:string;name:string;email:string;status:string}[]}) {
  const t=useTranslations("manager");const [email,setEmail]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");const [removing,setRemoving]=useState<string|null>(null);const [pending,transition]=useTransition();
  return <><div className="manager-heading"><h1>{t("accessTitle")}</h1><InfoHint label={t("accessTitle")} notes={[t("inviteHint"),t("revokeHint")]}/></div><p className="manager-context">{artist}</p><Link className="text-button" href="/settings">{t("backSettings")}</Link>
    {!owner?<p className="notice">{t("ownerOnly")}</p>:<section className="manager-panel"><form className="manager-invite-form" onSubmit={event=>{event.preventDefault();transition(async()=>{setError("");setNotice("");try{const failure=await inviteManager(email);setError(failure||"");if(!failure){setEmail("");setNotice(t("invited"));}}catch{setError(t("failed"));}});}}><label>{t("email")}<input type="email" required value={email} maxLength={254} onChange={event=>setEmail(event.target.value)}/></label><button className="primary" disabled={pending}>{t("invite")}</button></form>
      {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <div className="manager-access-list">{!members.length?<p className="muted">{t("noManagers")}</p>:members.map(row=><div className="manager-access-row" key={row.id}><div><strong>{row.name}</strong><span>{row.email}</span></div><span>{t(row.status==="active"?"active":row.status==="revoked"?"revoked":"pending")}</span>{row.status==="revoked"&&<button className="secondary" disabled={pending} onClick={()=>{setEmail(row.email);setNotice(t("reinviteHint"));}}>{t("reinvite")}</button>}{row.status!=="revoked"&&<button className="secondary" disabled={pending} onClick={()=>setRemoving(row.id)}>{t("revoke")}</button>}</div>)}</div>
    </section>}
    {removing&&<ConfirmDialog title={t("revokeTitle")} confirmLabel={t("revoke")} pending={pending} onClose={()=>setRemoving(null)} onConfirm={()=>transition(async()=>{try{const failure=await revokeManager(removing);setError(failure||"");if(!failure){setRemoving(null);setNotice(t("revoked"));}}catch{setError(t("failed"));}})}><p>{t("revokeHint")}</p>{error&&<p className="notice error" role="alert">{error}</p>}</ConfirmDialog>}
  </>;
}
