import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FormMessage } from "@/components/form";
import { ResetPasswordForm } from "./reset-password-form";

// The emailed link goes through /api/auth/reset-password/<token>, which
// redirects here with ?token=… (or ?error=INVALID_TOKEN).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="auth-stack">
      <h1>{t("resetTitle")}</h1>
      {typeof token === "string" ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <FormMessage tone="error">{t("linkInvalid")}</FormMessage>
          <Link href="/forgot-password">
            {t("requestNewLink")}
          </Link>
        </>
      )}
    </div>
  );
}
