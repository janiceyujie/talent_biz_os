import {requireTalent} from "@/lib/auth";
import {getWorkspaceManagers} from "@/lib/actions/manager";
import {ManagerAccess} from "@/components/views/manager-access";
export default async function Page() {
  const {talent}=await requireTalent();
  return <ManagerAccess artist={talent.name} owner={talent.role==="owner"} members={await getWorkspaceManagers()}/>;
}
