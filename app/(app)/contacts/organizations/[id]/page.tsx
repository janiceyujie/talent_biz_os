import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { OrganizationView } from "@/components/views/organization";
import { requireTalent } from "@/lib/auth";
import { getOrganizationProjects } from "@/lib/data/organizations";

/** One organisation: its people, the projects it's on, and the money on those it's the client of (decision 0012). */
export default async function Page({ params }: PageProps<"/contacts/organizations/[id]">) {
  const { id } = await params;
  const { talent } = await requireTalent();
  const projects = z.uuid().safeParse(id).success ? await getOrganizationProjects(talent.id, id) : null;
  if (!projects) notFound();
  return (
    <>
      <PageHeader titleKey="contacts" />
      <OrganizationView id={id} projects={projects} />
    </>
  );
}
