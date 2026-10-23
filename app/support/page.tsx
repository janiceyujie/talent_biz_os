import { requireStaff } from "@/lib/auth/staff";
import { toLocale } from "@/lib/i18n/config";
import { supportTranslator } from "@/lib/i18n/support-messages";
import { searchTargets } from "@/lib/support";
import { ErrorCodeLookup } from "@/components/support/error-code-lookup";
import { LookupForm } from "@/components/support/lookup-form";
import { openAccount } from "./actions";

export default async function SupportPage() {
  const viewer = await requireStaff();
  const t = await supportTranslator(toLocale(viewer.locale));
  return (
    <>
      <p className="muted">{t("intro")}</p>
      <section className="surface padded">
        <h2>{t("lookup.heading")}</h2>
        <LookupForm action={openAccount} />
      </section>
      <section className="surface padded">
        <h2>{t("errorCode.heading")}</h2>
        <ErrorCodeLookup targets={searchTargets()} />
      </section>
    </>
  );
}
