import {notFound} from "next/navigation";
import {requireTalent} from "@/lib/auth";
import {assertLocalExperiment} from "@/lib/ai/local-budget";
import {readAssistantArchive} from "@/lib/ai/assistant-history";
import {AssistantCostsView} from "@/components/views/assistant-costs";
export default async function Page(){
  try {assertLocalExperiment();} catch {notFound();}
  const {person,talent}=await requireTalent();
  const {runs}=await readAssistantArchive(person.personId,talent.id);
  return <AssistantCostsView runs={runs}/>;
}
