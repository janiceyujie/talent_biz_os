import Link from "next/link";
import { FormMessage } from "@/components/form";
import { ResetPasswordForm } from "./reset-password-form";

// The emailed link goes through /api/auth/reset-password/<token>, which
// redirects here with ?token=… (or ?error=INVALID_TOKEN).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">設定新密碼</h1>
      {typeof token === "string" ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <FormMessage tone="error">連結無效或已過期，請重新申請。</FormMessage>
          <Link href="/forgot-password" className="text-sm hover:underline">
            重新申請重設連結
          </Link>
        </>
      )}
    </div>
  );
}
