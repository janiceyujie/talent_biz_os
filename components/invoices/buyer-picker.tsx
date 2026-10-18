"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/app/combobox";
import { InfoHint } from "@/components/app/info-hint";
import { buyerDetails, buyerNeedsConfirmation, type BuyerDetails, type InvoiceBuyer } from "@/lib/invoices/buyers";

export function InvoiceBuyerPicker({ buyers, value, disabled, onApply }: {
  buyers: InvoiceBuyer[]; value: BuyerDetails; disabled: boolean; onApply: (value: BuyerDetails, source: InvoiceBuyer) => void;
}) {
  const t = useTranslations("invoices");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<InvoiceBuyer | null>(null);
  const [applied, setApplied] = useState(false);
  const notice = applied ? t(!value.buyerAddress.trim() || !value.recipient.trim() ? "buyerMissing" : "buyerApplied") : "";
  const matches = buyers.filter((b) => `${b.label} ${b.recipient}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const apply = (buyer: InvoiceBuyer) => {
    onApply(buyerDetails(buyer), buyer);
    setQuery(""); setPending(null);
    setApplied(true);
  };
  return <fieldset className="invoice-buyer-picker" disabled={disabled}>
    <div className="invoice-buyer-search">
      <Combobox label={t("chooseBuyer")} placeholder={t("buyerSearch")} text={query}
        onText={(v) => {setQuery(v); setPending(null); setApplied(false);}} explicitPick
        options={matches.map((b) => ({id: b.id, primary: b.label,
          secondary: [b.recommended ? t("buyerLinked") : t(b.kind === "organization" ? "buyerOrganization" : "buyerContact"), b.recipient].filter(Boolean).join(" · ")}))}
        onPick={(id) => {
          const buyer = buyers.find((b) => b.id === id);
          if (!buyer) return;
          setApplied(false);
          if (buyerNeedsConfirmation(value, buyerDetails(buyer))) {setPending(buyer); setQuery(buyer.label);}
          else apply(buyer);
        }} />
      <InfoHint label={t("chooseBuyer")} notes={[t("buyerHelp")]} />
    </div>
    {query && !matches.length && !pending && <p role="status">{t("buyerNoMatches")}</p>}
    {pending && <div className="invoice-defaults-confirm">
      <p>{t("buyerReplace", {name: pending.label})}</p>
      <div className="invoice-actions">
        <button type="button" className="secondary" onClick={() => apply(pending)}>{t("confirmApplyDefaults")}</button>
        <button type="button" className="text-button" onClick={() => {setPending(null); setQuery("");}}>{t("keepCurrentDefaults")}</button>
      </div>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </fieldset>;
}
