"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {useTranslations} from "next-intl";
import type {ManagerCapability} from "@/lib/manager/entitlement";
import {useAppData} from "./app-data";
import {type ArtistAccess} from "@/lib/manager/scope";
import {portfolioLink,restorePortfolioSelection} from "@/lib/manager/selection";
import type {PortfolioWorkspace} from "@/lib/manager/workspace-types";
type Scope={capability:ManagerCapability;enable:()=>void;artists:ArtistAccess[];ids:string[]|null;ready:boolean;setIds:(ids:string[]|null)=>void;href:(href:string)=>string;refresh:()=>void;revision:number};
const Context=createContext<Scope|null>(null);
export const usePortfolio=()=>useContext(Context);
export function PortfolioProvider({artists,capability,children}:{artists:ArtistAccess[];capability:ManagerCapability;children:ReactNode}) {
  const own=useAppData(),router=useRouter(),searchParams=useSearchParams();
  const query=searchParams.toString();
  const [ids,setSelection]=useState<string[]|null>(null),[ready,setReady]=useState(false),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  const lastPicked=useRef<string[]|null>(null);
  const roster=JSON.stringify(artists.map(row=>row.id));
  const key=`taloox-portfolio:${own.person.email}`;
  useEffect(()=>{
    const params=new URLSearchParams(query);
    let restored:string[]|null=null;
    if(!capability.enabled)restored=null;
    else if(params.get("portfolio")==="1")restored=restorePortfolioSelection(params.get("artist")==="none"?[]:params.getAll("artist"),artists,capability.artistLimit);
    else if(params.get("portfolio")!=="own")try{restored=restorePortfolioSelection(JSON.parse(localStorage.getItem(key)||"null"),artists,capability.artistLimit);}catch{}
    try{lastPicked.current=restorePortfolioSelection(JSON.parse(localStorage.getItem(`${key}:picked`)||"null"),artists,capability.artistLimit);}catch{}
    if(restored!==null)lastPicked.current=restored;
    queueMicrotask(()=>{setSelection(restored);setReady(true);});
    try{localStorage.setItem(key,JSON.stringify(restored));}catch{}
  // The roster string makes membership changes invalidate an old selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,roster,query,capability.enabled,capability.artistLimit]);
  const setIds=(next:string[]|null)=>{
    if(next&&(!capability.enabled||next.length>capability.artistLimit))return;
    if(next!==null)next=restorePortfolioSelection(next,artists,capability.artistLimit)??[];
    if(next!==null){lastPicked.current=next;try{localStorage.setItem(`${key}:picked`,JSON.stringify(next));}catch{}}
    setSelection(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}
    const url=new URL(window.location.href);url.searchParams.delete("artist");url.searchParams.delete("portfolio");
    router.replace(portfolioLink(`${url.pathname}${url.search}${url.hash}`,next),{scroll:false});
  };
  return <Context.Provider value={{capability,enable:()=>setIds(artists.length>capability.artistLimit?[]:(lastPicked.current||artists.map(row=>row.id))),artists,ids,ready,setIds,href:href=>portfolioLink(href,ids),revision,refresh}}>{children}</Context.Provider>;
}
/** Fetch only when a portfolio page is in use. Scope changes cannot retain another artist's stale data. */
export function usePortfolioWorkspace(query = "view=reminders") {
  const scope=usePortfolio(),t=useTranslations("portfolio");
  const signature=scope?.ids===null||!scope?.ready?null:JSON.stringify({ids:scope.ids.slice().sort(),query});
  const [poll,setPoll]=useState(0);
  const revision=`${scope?.revision||0}:${poll}`;
  const [resource,setResource]=useState<{signature:string;revision:string;data?:PortfolioWorkspace;error?:"access"|"failed"|"limit"|"plan"}>();
  useEffect(()=>{
    if(signature===null)return;
    const controller=new AbortController();
    const request=JSON.parse(signature) as {ids:string[];query:string},ids=request.ids,params=new URLSearchParams(request.query);
    if(!ids.length)params.set("artist","none");else ids.forEach(id=>params.append("artist",id));
    fetch(`/api/manager/workspace?${params}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error==="limit"?"limit":error.error==="plan"?"plan":response.status===403?"access":"failed");}
      const data=await response.json() as PortfolioWorkspace;
      if(!controller.signal.aborted)setResource({signature,revision,data});
    }).catch(error=>{if(!controller.signal.aborted)setResource({signature,revision,error:error.message==="access"?"access":error.message==="limit"?"limit":error.message==="plan"?"plan":"failed"});});
    return ()=>controller.abort();
  },[signature,revision]);
  useEffect(()=>{
    if(signature===null||query!=="view=reminders")return;
    const timer=setInterval(()=>{if(document.visibilityState==="visible")setPoll(value=>value+1);},30000);
    return ()=>clearInterval(timer);
  },[signature,query]);
  // Recheck on focus; reminder refresh reads only reminder-relevant records.
  useEffect(()=>{
    if(signature===null)return;
    const onFocus=()=>scope?.refresh();window.addEventListener("focus",onFocus);
    return ()=>window.removeEventListener("focus",onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  const current=resource?.signature===signature&&resource.revision===revision?resource:undefined;
  return {active:signature!==null,hydrating:!!scope?.capability.enabled&&!scope.ready,loading:signature!==null&&!current,data:current?.data,error:current?.error?t(current.error):null,retry:scope?.refresh};
}
