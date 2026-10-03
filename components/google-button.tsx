"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/form";
import { authClient } from "@/lib/auth/client";

/** "Continue with Google". A failure comes back to `returnTo` with ?error=…; a new person goes to onboarding. */
export function GoogleButton({ label, returnTo }: { label: string; returnTo: string }) {
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
          callbackURL: "/",
          newUserCallbackURL: "/onboarding",
          errorCallbackURL: returnTo,
        });
      }}
    >
      {label}
    </button>
  );
}
