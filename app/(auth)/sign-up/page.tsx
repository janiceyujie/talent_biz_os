import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { FormMessage } from "@/components/form";
import { isGoogleEnabled } from "@/lib/auth";
import { googleErrorKey } from "@/lib/auth/google-errors";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const t = await getTranslations("auth");
  const googleError = googleErrorKey((await searchParams).error);
  return (
    <div className="auth-stack">
      <h1>{t("createAccount")}</h1>
      {googleError && <FormMessage tone="error">{t(`googleError.${googleError}`)}</FormMessage>}
      {isGoogleEnabled && <GoogleButton label={t("googleSignUp")} returnTo="/sign-up" />}
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
