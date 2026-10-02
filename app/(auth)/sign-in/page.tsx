import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">登入</h1>
      {isGoogleEnabled && <GoogleButton label="使用 Google 登入" />}
      <SignInForm />
      <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/forgot-password" className="hover:underline">
          忘記密碼？
        </Link>
        <Link href="/sign-up" className="hover:underline">
          建立帳號
        </Link>
      </div>
    </div>
  );
}
