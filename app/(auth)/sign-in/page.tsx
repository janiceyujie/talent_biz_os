import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { FormMessage } from "@/components/form";
import { isGoogleEnabled } from "@/lib/auth";
import { googleErrorKey } from "@/lib/auth/google-errors";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const googleError = googleErrorKey(params.error);
  // Linking the Gmail add-on (docs/design/gmail-addon.md): back there after, and only an existing account.
  const next = typeof params.next === "string" && params.next.startsWith("/addon/link?") ? params.next : null;
  const here = next ? `/sign-in?${new URLSearchParams({ next })}` : "/sign-in";
  return (
    <div className="auth-stack">
      <h1>{t("signIn")}</h1>
      {next && <FormMessage tone="info">{t("addonSignIn")}</FormMessage>}
      {googleError && <FormMessage tone="error">{t(`googleError.${googleError}`)}</FormMessage>}
      {isGoogleEnabled && <GoogleButton label={t("googleSignIn")} returnTo={here} next={next ?? "/"} signUp={!next} />}
      <SignInForm next={next ?? "/"} />
      <div className="auth-links">
        <Link href="/forgot-password">
          {t("forgot")}
        </Link>
        {!next && (
          <Link href="/sign-up">
            {t("createAccount")}
          </Link>
        )}
      </div>
    </div>
  );
}
