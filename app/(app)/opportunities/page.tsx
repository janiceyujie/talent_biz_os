import { PageHeader } from "@/components/app/page-header";
import { OpportunitiesView } from "@/components/views/opportunities";
import { requireTalent } from "@/lib/auth";
import { getOpportunitiesWorkspace } from "@/lib/data/opportunities";

export default async function Page() {
  const { talent } = await requireTalent();
  // The list itself comes a page at a time from /api/opportunities (decision 0011).
  const workspace = await getOpportunitiesWorkspace(talent.id);
  return (
    <>
      <PageHeader titleKey="opportunities" />
      <OpportunitiesView workspace={workspace} />
    </>
  );
}
