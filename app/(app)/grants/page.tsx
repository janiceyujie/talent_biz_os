import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { GrantsView } from "@/components/views/grants";
import { getAppData } from "@/lib/data";
import { getGrantWorkspace } from "@/lib/data/grants";
import { grantsLocalEnabled } from "@/lib/grants/config";
export default async function Page({searchParams}:PageProps<"/grants">) {
  if(!grantsLocalEnabled()) notFound();
  const [workspace,data]=await Promise.all([getGrantWorkspace(),getAppData()]);
  const {application}=await searchParams;
  const initialOpportunityId=workspace.applications.find(a=>a.id===application)?.opportunityId||"";
  return <><PageHeader titleKey="grants"/><GrantsView key={initialOpportunityId||"discover"} initialOpportunityId={initialOpportunityId} workspace={workspace} projects={data.projects} timeZone={data.talent.timeZone}/></>;
}
