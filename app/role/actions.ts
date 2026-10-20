"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RolePickerState } from "@/components/role/role-picker";
import { errorText } from "@/lib/actions/validation";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { person, preference } from "@/lib/db/schema";
import { profileRoleFromForm } from "@/lib/profile";
import { roleReturnHref } from "@/lib/role-return";
import { isAppearance } from "@/lib/roles";

/** Occupation and appearance never change a workspace's vertical, plan, or memberships. */
export async function updateRole(_prev: RolePickerState, formData: FormData): Promise<RolePickerState> {
  const { person: current, talent } = await requireTalent();
  const fail = await errorText();
  const profile = profileRoleFromForm(formData);
  const appearance = formData.get("appearance");
  if (!profile.success || !isAppearance(appearance)) return { error: fail("invalid") };
  try {
    await db.transaction(async tx => {
      await tx.update(person).set({ avatarAppearance: appearance }).where(eq(person.id, current.personId));
      await tx.insert(preference).values({ personId: current.personId, talentId: talent.id, key: "profile.role", value: profile.data })
        .onConflictDoUpdate({ target: [preference.personId, preference.talentId, preference.key], set: { value: profile.data, updatedAt: new Date() } });
    });
  } catch {
    return { error: fail("profileSaveFailed") };
  }
  revalidatePath("/", "layout");
  const returnTo = formData.get("returnTo");
  redirect(roleReturnHref(typeof returnTo === "string" ? returnTo : undefined));
}
