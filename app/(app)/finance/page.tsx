import { PageHeader } from "@/components/app/page-header";
import { FinanceView } from "@/components/views/finance";

export default function Page() {
  return (
    <>
      <PageHeader title="內帳分析" />
      <FinanceView />
    </>
  );
}
