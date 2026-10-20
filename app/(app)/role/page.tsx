import { and, eq } from "drizzle-orm";
import { RolePicker } from "@/components/role/role-picker";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { person, preference } from "@/lib/db/schema";
import { roleOf } from "@/lib/roles";
import { roleReturnHref } from "@/lib/role-return";
import { profileRoleSchema } from "@/lib/profile";
import { updateRole } from "@/app/role/actions";

/** "Change role": the onboarding role picker, without the name step. */
export default async function ChangeRolePage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const returnHref = roleReturnHref((await searchParams).returnTo);
  const { person: current, talent } = await requireTalent();
  const [row] = await db
    .select({ accountType: person.accountType, avatarAppearance: person.avatarAppearance })
    .from(person)
    .where(eq(person.id, current.personId));
  const [saved] = await db.select({ value: preference.value }).from(preference).where(and(eq(preference.personId, current.personId), eq(preference.talentId, talent.id), eq(preference.key, "profile.role")));
  const profile = profileRoleSchema.safeParse(saved?.value);
  return (
    <RolePicker
      mode="change"
      returnHref={returnHref}
      initial={{
        role: roleOf(row.accountType, talent.vertical),
        appearance: row.avatarAppearance,
        profileRole: profile.success ? profile.data.role : roleOf(row.accountType, talent.vertical),
      }}
      action={updateRole}
    />
  );
}
