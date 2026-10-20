import { PageHeader } from "@/components/app/page-header";
import { InboxView, IntakeHint } from "@/components/views/inbox";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="inbox" subtitle={<IntakeHint />} />
      <InboxView />
    </>
  );
}
