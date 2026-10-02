import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <div className="auth-stack">
      <h1>建立帳號</h1>
      {isGoogleEnabled && <GoogleButton label="使用 Google 註冊" />}
      <SignUpForm />
      <p className="muted">
        已經有帳號了？{" "}
        <Link href="/sign-in">
          登入
        </Link>
      </p>
    </div>
  );
}
