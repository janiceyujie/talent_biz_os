import { PageHeader } from "@/components/app/page-header";
import { ProjectsView } from "@/components/views/projects";
import { phases } from "@/lib/domain/phases";

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const { id, phase } = await searchParams;
  const initialPhase = phases.find((p) => p === phase);
  return (
    <>
      <PageHeader titleKey="projects" />
      <ProjectsView selectedId={typeof id === "string" ? id : ""} initialPhase={initialPhase} />
    </>
  );
}
