"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function GoogleButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={secondaryButtonClass}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      }}
    >
      {label}
    </button>
  );
}
