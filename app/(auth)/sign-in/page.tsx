import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { FormMessage } from "@/components/form";
import { isGoogleEnabled } from "@/lib/auth";
import { googleErrorKey } from "@/lib/auth/google-errors";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const t = await getTranslations("auth");
  const googleError = googleErrorKey((await searchParams).error);
  return (
    <div className="auth-stack">
      <h1>{t("signIn")}</h1>
      {googleError && <FormMessage tone="error">{t(`googleError.${googleError}`)}</FormMessage>}
      {isGoogleEnabled && <GoogleButton label={t("googleSignIn")} returnTo="/sign-in" />}
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
