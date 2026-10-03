import { PageHeader } from "@/components/app/page-header";
import { TodayView } from "@/components/views/today";

export default function Page() {
  return (
    <>
      <PageHeader title="today" />
      <TodayView />
    </>
  );
}
