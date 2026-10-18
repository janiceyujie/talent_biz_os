"use client";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { taiwanEinvoiceCapability, type BillingDocumentKind } from "@/lib/invoices/document";

export function InvoiceDocumentNotice({ kind }: { kind: BillingDocumentKind }) {
  const t = useTranslations("invoices");
  return <div className="invoice-document-notice">
    <span>{t(kind === "tw_payment_request" ? "requestNotice" : "commercialNotice")}</span>
    <InfoHint label={t("documentKind")} notes={[
      t("numberNotice"), t("statusNotice"),
      ...(!taiwanEinvoiceCapability.available ? [t("taiwanUnavailable")] : []),
    ]} />
  </div>;
}
