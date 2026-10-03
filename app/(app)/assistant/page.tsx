import { PageHeader } from "@/components/app/page-header";
import { AssistantView } from "@/components/views/assistant";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="assistant" />
      <AssistantView />
    </>
  );
}
