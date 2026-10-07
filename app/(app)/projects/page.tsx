import { PageHeader } from "@/components/app/page-header";
import { ProjectsView } from "@/components/views/projects";

// The list's view, filters, order, and open project live in the address; the view reads them there.
export default function Page() {
  return (
    <>
      <PageHeader titleKey="projects" />
      <ProjectsView />
    </>
  );
}
