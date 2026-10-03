import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const t = await getTranslations("auth");
  return (
    <div className="auth-stack">
      <h1>{t("signIn")}</h1>
      {isGoogleEnabled && <GoogleButton label={t("googleSignIn")} />}
      <SignInForm />
      <div className="auth-links">
        <Link href="/forgot-password">
          {t("forgot")}
        </Link>
        <Link href="/sign-up">
          {t("createAccount")}
        </Link>
      </div>
    </div>
  );
}
