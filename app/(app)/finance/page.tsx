import { PageHeader } from "@/components/app/page-header";
import { FinanceView } from "@/components/views/finance";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="finance" />
      <FinanceView />
    </>
  );
}
