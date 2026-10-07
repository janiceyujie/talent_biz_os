import { ProjectsView } from "@/components/views/projects";

// The list's view, filters, order, and open project live in the address; the view reads them there.
// The view renders the page header too, since its New project button opens the view's editor.
export default function Page() {
  return <ProjectsView />;
}
