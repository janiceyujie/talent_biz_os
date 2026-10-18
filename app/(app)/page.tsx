import {PortfolioPage} from "@/components/views/portfolio-page";
import { PageHeader } from "@/components/app/page-header";
import { TodayDate, TodayView } from "@/components/views/today";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="today" subtitle={<TodayDate />} />
      <PortfolioPage view="today"><TodayView /></PortfolioPage>
    </>
  );
}
