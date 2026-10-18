import {getTranslations} from "next-intl/server";
import {requirePerson} from "@/lib/auth";
import {getManagerCapability} from "@/lib/data/manager-entitlement";
import {getManagerOverview,getManagerRoster} from "@/lib/data/manager";
import {getManagerInvitations} from "@/lib/actions/manager";
import {dateInZone} from "@/lib/domain/dates";
import {ManagerScopeError} from "@/lib/manager/scope";
import type {ManagerOverview} from "@/lib/manager/types";
import {ManagerDashboard} from "@/components/views/manager-dashboard";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const person=await requirePerson();const params=await searchParams;const t=await getTranslations("manager");
  const requested=params.artist===undefined?undefined:params.artist==="none"?[]:Array.isArray(params.artist)?params.artist:[params.artist];
  const start=typeof params.start==="string"?params.start:dateInZone("UTC",-7);
  const end=typeof params.end==="string"?params.end:dateInZone("UTC",30);
  const initialTab=params.view==="messages"||params.view==="finance"?params.view:"calendar";
  const invitations=await getManagerInvitations();
  let data:ManagerOverview;let errorMessage:string|undefined;
  try {data=await getManagerOverview(person.personId,requested,start,end,initialTab,typeof params.after==="string"?params.after:undefined);}
  catch(error) {
    if(!(error instanceof ManagerScopeError))throw error;
    data={artistLimit:(await getManagerCapability(person.personId)).artistLimit,artists:await getManagerRoster(person.personId),selectedIds:[],calendar:[],messages:[],finance:[],start:dateInZone("UTC",-7),end:dateInZone("UTC",30)};
    errorMessage=t(error.code==="forbidden"?"notFound":error.code);
  }
  return <ManagerDashboard key={`${data.selectedIds.join()}:${data.start}:${data.end}:${initialTab}:${typeof params.after==="string"?params.after:""}`} data={data} invitations={invitations} initialTab={initialTab} error={errorMessage}/>;
}
