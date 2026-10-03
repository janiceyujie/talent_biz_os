import { redirect } from "next/navigation";
import { RolePicker } from "@/components/role/role-picker";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { createTalent } from "./actions";

export default async function OnboardingPage() {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");
  return (
    <RolePicker
      mode="onboarding"
      initial={{ role: "musician", appearance: "non_binary", vertical: "music", name: person.displayName }}
      action={createTalent}
    />
  );
}
