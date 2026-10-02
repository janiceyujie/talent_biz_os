import { PageHeader } from "@/components/app/page-header";
import { ProjectsView } from "@/components/views/projects";

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const { id } = await searchParams;
  return (
    <>
      <PageHeader title="合作案" />
      <ProjectsView selectedId={typeof id === "string" ? id : ""} />
    </>
  );
}
