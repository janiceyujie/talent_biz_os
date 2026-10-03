import { PageHeader } from "@/components/app/page-header";
import { PartnersView } from "@/components/views/partners";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="partners" />
      <PartnersView />
    </>
  );
}
