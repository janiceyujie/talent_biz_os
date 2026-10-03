import { PageHeader } from "@/components/app/page-header";
import { CalendarView } from "@/components/views/calendar";

export default async function Page({ searchParams }: PageProps<"/calendar">) {
  const { day } = await searchParams;
  return (
    <>
      <PageHeader title="calendar" />
      <CalendarView initialDay={typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ""} />
    </>
  );
}
