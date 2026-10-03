import { PageHeader } from "@/components/app/page-header";
import { DraftsView } from "@/components/views/drafts";

export default async function Page({ searchParams }: PageProps<"/drafts">) {
  const { project } = await searchParams;
  return (
    <>
      <PageHeader title="drafts" />
      <DraftsView initialProjectId={typeof project === "string" ? project : ""} />
    </>
  );
}
