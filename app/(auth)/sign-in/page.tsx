import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="auth-stack">
      <h1>登入</h1>
      {isGoogleEnabled && <GoogleButton label="使用 Google 登入" />}
      <SignInForm />
      <div className="auth-links">
        <Link href="/forgot-password">
          忘記密碼？
        </Link>
        <Link href="/sign-up">
          建立帳號
        </Link>
      </div>
    </div>
  );
}
