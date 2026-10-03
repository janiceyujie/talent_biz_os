import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");
  const t = await getTranslations("onboarding");

  return (
    <main className="auth-page">
      <div className="surface auth-card wide">
        <div className="auth-brand">
          <span>TB</span>
          <strong>Talent Business OS</strong>
        </div>
        <div className="auth-stack">
          <div>
            <h1>{t("welcome", { name: person.displayName })}</h1>
            <p className="muted">{t("intro")}</p>
          </div>
          <OnboardingForm defaultName={person.displayName} />
        </div>
      </div>
    </main>
  );
}
