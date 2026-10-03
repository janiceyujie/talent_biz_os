"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { RolePickerState } from "@/components/role/role-picker";
import { errorText } from "@/lib/actions/validation";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { person, talent, verticals } from "@/lib/db/schema";
import { isAppearance, isRole, roleSettings, type Vertical } from "@/lib/roles";

const isVertical = (value: unknown): value is Vertical => verticals.includes(value as Vertical);

/** Change role and assistant look. The role is a preference; it changes no one's access. */
export async function updateRole(_prev: RolePickerState, formData: FormData): Promise<RolePickerState> {
  const { person: current, talent: currentTalent } = await requireTalent();
  const fail = await errorText();

  const role = formData.get("role");
  const appearance = formData.get("appearance");
  const vertical = formData.get("vertical");
  if (!isRole(role) || !isAppearance(appearance) || !isVertical(vertical)) return { error: fail("invalid") };
  const settings = roleSettings(role, vertical);
  // The vertical belongs to the talent, so only its owner changes it.
  if (currentTalent.role !== "owner" && settings.vertical !== currentTalent.vertical) return { error: fail("onlyOwner") };

  await db.transaction(async (tx) => {
    await tx
      .update(person)
      .set({ accountType: settings.accountType, avatarAppearance: appearance })
      .where(eq(person.id, current.personId));
    await tx.update(talent).set({ vertical: settings.vertical }).where(eq(talent.id, currentTalent.id));
  });
  redirect("/");
}
