import { PageHeader } from "@/components/app/page-header";
import { FilesView } from "@/components/views/files";

export default function Page() {
  return (
    <>
      <PageHeader title="素材歸檔" />
      <FilesView />
    </>
  );
}
