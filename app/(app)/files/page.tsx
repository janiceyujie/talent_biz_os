import { PageHeader } from "@/components/app/page-header";
import { FilesView } from "@/components/views/files";

export default function Page() {
  return (
    <>
      <PageHeader title="files" />
      <FilesView />
    </>
  );
}
