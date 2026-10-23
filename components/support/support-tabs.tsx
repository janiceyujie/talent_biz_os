"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSupportTranslations } from "@/lib/i18n/use-support-translations";

/** The Support page's sections: accounts (and the account pages under them), and the beta list. */
export function SupportTabs() {
  const t = useSupportTranslations("support.tabs");
  const path = usePathname();
  const onBeta = path.startsWith("/support/beta");
  return (
    <nav className="support-tabs">
      <Link href="/support" aria-current={onBeta ? undefined : "page"}>
        {t("accounts")}
      </Link>
      <Link href="/support/beta" aria-current={onBeta ? "page" : undefined}>
        {t("beta")}
      </Link>
    </nav>
  );
}
