"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { RolePickerState } from "@/components/role/role-picker";
import { errorText } from "@/lib/actions/validation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { db } from "@/lib/db";
import { membership, person, preference, talent } from "@/lib/db/schema";
import { profileRoleFromForm } from "@/lib/profile";
import { isAppearance } from "@/lib/roles";

/** Create the owner's workspace; optional occupation is stored separately from access. */
export async function createTalent(_prev: RolePickerState, formData: FormData): Promise<RolePickerState> {
  const current = await requirePerson();
  if (await getCurrentTalent(current.personId)) redirect("/");
  const fail = await errorText();
  const profile = profileRoleFromForm(formData);
  const appearance = formData.get("appearance");
  const name = String(formData.get("name") ?? "").trim();
  if (!profile.success || !isAppearance(appearance) || name.length > 200) return { error: fail("invalid") };
  if (!name) return { error: fail("nameRequired") };
  try {
    await db.transaction(async tx => {
      // Serialize first-run submissions so a double click cannot create two workspaces.
      await tx.select({ id: person.id }).from(person).where(eq(person.id, current.personId)).for("update");
      const owned = await tx.select({ id: membership.id }).from(membership).where(and(eq(membership.personId, current.personId), eq(membership.role, "owner"), eq(membership.status, "active"))).limit(1);
      if (owned.length) return;
      await tx.update(person).set({ avatarAppearance: appearance }).where(eq(person.id, current.personId));
      const [created] = await tx.insert(talent).values({ name, vertical: "other" }).returning({ id: talent.id });
      await tx.insert(membership).values({ talentId: created.id, personId: current.personId, role: "owner" });
      await tx.insert(preference).values({ personId: current.personId, talentId: created.id, key: "profile.role", value: profile.data });
    });
  } catch {
    return { error: fail("profileSaveFailed") };
  }
  redirect("/");
}
