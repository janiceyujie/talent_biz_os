import { eq } from "drizzle-orm";
import { RolePicker } from "@/components/role/role-picker";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { person } from "@/lib/db/schema";
import { roleOf, toVertical } from "@/lib/roles";
import { roleReturnHref } from "@/lib/role-return";
import { updateRole } from "./actions";

/** "Change role": the onboarding role picker, without the name step. */
export default async function ChangeRolePage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const returnHref = roleReturnHref((await searchParams).returnTo);
  const { person: current, talent } = await requireTalent();
  const [row] = await db
    .select({ accountType: person.accountType, avatarAppearance: person.avatarAppearance })
    .from(person)
    .where(eq(person.id, current.personId));
  return (
    <RolePicker
      mode="change"
      returnHref={returnHref}
      initial={{
        role: roleOf(row.accountType, talent.vertical),
        appearance: row.avatarAppearance,
        vertical: toVertical(talent.vertical),
      }}
      action={updateRole}
    />
  );
}
