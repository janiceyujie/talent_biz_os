import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth");
  return (
    <div className="auth-stack">
      <h1>{t("createAccount")}</h1>
      {isGoogleEnabled && <GoogleButton label={t("googleSignUp")} />}
      <SignUpForm />
      <p className="muted">
        {t("haveAccount")}{" "}
        <Link href="/sign-in">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
