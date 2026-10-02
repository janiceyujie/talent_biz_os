import { PageHeader } from "@/components/app/page-header";
import { InboxView } from "@/components/views/inbox";

export default function Page() {
  return (
    <>
      <PageHeader title="進件分類" />
      <InboxView />
    </>
  );
}
