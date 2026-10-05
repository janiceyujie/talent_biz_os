import { PlannerView } from "@/components/views/planner";

export default async function Page({ searchParams }: PageProps<"/calendar">) {
  const { day, date } = await searchParams;
  const valid = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return (
    <PlannerView initialDay={valid(day)} initialDate={valid(date)} />
  );
}
