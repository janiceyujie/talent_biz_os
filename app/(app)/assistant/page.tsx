import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { AssistantPage } from "@/components/views/assistant-page";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="assistant" />
      {/* The open conversation is read from the address on the client. */}
      <Suspense>
        <AssistantPage />
      </Suspense>
    </>
  );
}
