import { redirect } from "next/navigation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");

  return (
    <main className="auth-page">
      <div className="surface auth-card wide">
        <div className="auth-brand">
          <span>TB</span>
          <strong>Talent Business OS</strong>
        </div>
        <div className="auth-stack">
          <div>
            <h1>歡迎，{person.displayName}</h1>
            <p className="muted">先告訴我們你經營的是什麼，之後可以再修改。</p>
          </div>
          <OnboardingForm defaultName={person.displayName} />
        </div>
      </div>
    </main>
  );
}
