import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentTalent, requirePerson } from "@/lib/auth";
import { PRODUCT_MONOGRAM, PRODUCT_NAME } from "@/lib/brand";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const person = await requirePerson();
  if (await getCurrentTalent(person.personId)) redirect("/");
  const t = await getTranslations("onboarding");

  return (
    <main className="auth-page">
      <div className="surface auth-card wide">
        <div className="auth-brand">
          <span>{PRODUCT_MONOGRAM}</span>
          <strong>{PRODUCT_NAME}</strong>
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
