import {notFound} from "next/navigation";
import {requireTalent} from "@/lib/auth";
import {assertInternalAssistantReports,readAssistantEvaluations} from "@/lib/ai/assistant-history";
import {AssistantCostsView} from "@/components/views/assistant-costs";
export default async function Page(){
  try {assertInternalAssistantReports();} catch {notFound();}
  const {talent}=await requireTalent();
  if(talent.role!=="owner")notFound();
  return <AssistantCostsView runs={await readAssistantEvaluations()}/>;
}
