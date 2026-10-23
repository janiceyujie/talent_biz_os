import { requireStaff } from "@/lib/auth/staff";
import { localeNames, locales, toLocale } from "@/lib/i18n/config";
import { supportTranslator } from "@/lib/i18n/support-messages";
import { betaList } from "@/lib/support/beta-list";
import { BetaAdd } from "@/components/support/beta-add";
import { BetaTable } from "@/components/support/beta-table";

const time = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(d) : null;

/** The beta list (decision 0028): who may sign up. Support staff read it; admins change it. */
export default async function BetaListPage() {
  const viewer = await requireStaff();
  const t = await supportTranslator(toLocale(viewer.locale));
  const isAdmin = viewer.role === "admin";
  const places = (await betaList()).map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    note: p.note,
    language: localeNames[toLocale(p.locale)],
    status: p.status,
    added: time(p.createdAt),
    addedBy: p.addedBy,
    invited: time(p.invitationSentAt),
    invitedBy: p.invitationSentBy,
    signedUp: time(p.usedAt),
    withdrawn: time(p.withdrawnAt),
    withdrawnBy: p.withdrawnBy,
  }));
  return (
    <>
      <p className="muted">{t("beta.intro")}</p>
      <p className="notice">{t("beta.cap")}</p>
      {isAdmin && (
        <section className="surface padded">
          <h2>{t("beta.add.heading")}</h2>
          <BetaAdd locales={locales.map((l) => ({ value: l, name: localeNames[l] }))} defaultLocale={toLocale(viewer.locale)} />
        </section>
      )}
      <section className="surface padded">
        <h2>{t("tabs.beta")}</h2>
        <BetaTable places={places} isAdmin={isAdmin} />
      </section>
    </>
  );
}
