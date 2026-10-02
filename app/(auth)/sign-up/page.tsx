import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">建立帳號</h1>
      {isGoogleEnabled && <GoogleButton label="使用 Google 註冊" />}
      <SignUpForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        已經有帳號了？{" "}
        <Link href="/sign-in" className="hover:underline">
          登入
        </Link>
      </p>
    </div>
  );
}
