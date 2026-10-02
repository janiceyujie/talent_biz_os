import { redirect } from "next/navigation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-6 text-sm font-semibold tracking-tight text-zinc-500">Talent Biz OS</p>
        <h1 className="text-xl font-semibold">歡迎，{person.displayName}</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          先告訴我們你經營的是什麼，之後可以再修改。
        </p>
        <OnboardingForm defaultName={person.displayName} />
      </div>
    </main>
  );
}
