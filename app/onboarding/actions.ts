"use server";

import { redirect } from "next/navigation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { db } from "@/lib/db";
import { membership, talent, verticals } from "@/lib/db/schema";

export type OnboardingState = { error?: string };

type Vertical = (typeof verticals)[number];
const isVertical = (value: unknown): value is Vertical => verticals.includes(value as Vertical);

// Creates the person's talent and makes them its owner. Account type is
// `individual` by default (person.account_type); manager and agency come later.
export async function createTalent(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const vertical = formData.get("vertical");
  if (!name) return { error: "請輸入名稱。" };
  if (!isVertical(vertical)) return { error: "請選擇類型。" };

  await db.transaction(async (tx) => {
    const [created] = await tx.insert(talent).values({ name, vertical }).returning({ id: talent.id });
    await tx.insert(membership).values({ talentId: created.id, personId: person.personId, role: "owner" });
  });
  redirect("/");
}
