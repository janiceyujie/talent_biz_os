"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/form";
import { authClient } from "@/lib/auth/client";

/**
 * "Continue with Google". A failure comes back to `returnTo` with ?error=…; a new person goes to
 * onboarding. Without `signUp`, a Google account we don't know is refused (error=signup_disabled).
 */
export function GoogleButton({ label, returnTo, next = "/", signUp = true }: { label: string; returnTo: string; next?: string; signUp?: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({
          provider: "google",
          callbackURL: next,
          newUserCallbackURL: "/onboarding",
          errorCallbackURL: returnTo,
          requestSignUp: signUp,
        });
      }}
    >
      {label}
    </button>
  );
}
