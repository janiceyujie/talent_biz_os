import { PageHeader } from "@/components/app/page-header";
import { DraftsView } from "@/components/views/drafts";

const MAX_ASKS = 20;

export default async function Page({ searchParams }: PageProps<"/drafts">) {
  const { project, ask } = await searchParams;
  // Questions a project's screen sent over to ask in this reply (Questions for them → Ask in a reply).
  const asks = (Array.isArray(ask) ? ask : ask ? [ask] : []).map((q) => q.trim().slice(0, 300)).filter(Boolean).slice(0, MAX_ASKS);
  return (
    <>
      <PageHeader titleKey="drafts" />
      <DraftsView initialProjectId={typeof project === "string" ? project : ""} initialAsks={asks} />
    </>
  );
}
