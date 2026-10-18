import {PortfolioPage} from "@/components/views/portfolio-page";
import { PlannerView } from "@/components/views/planner";

export default async function Page({ searchParams }: PageProps<"/calendar">) {
  const { day, date } = await searchParams;
  const valid = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return (
    <PortfolioPage key={`${valid(day)}:${valid(date)}`} view="calendar" initialDay={valid(day)} initialDate={valid(date)}><PlannerView initialDay={valid(day)} initialDate={valid(date)} /></PortfolioPage>
  );
}
