"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { buyerBillingFields, type BuyerBillingRecord } from "@/lib/invoices/buyer-writeback";
import type { InvoiceBuyer } from "@/lib/invoices/buyers";
import type { PostalAddress } from "@/lib/invoices/address";
import { invoiceRequest } from "./request";

type Fields = {address: string; email: string};
export function InvoiceBuyerSaveback({source, address, addressParts, email, disabled, onBusy}: {
  source: InvoiceBuyer; address: string; addressParts?: PostalAddress; email: string; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("invoices"), router = useRouter();
  const target = {kind: source.kind, id: source.id.slice(source.id.indexOf(":") + 1)};
  const draft = {address: address.trim(), email: email.trim()};
  const [review, setReview] = useState<{stored: BuyerBillingRecord; draft: Fields} | null>(null);
  const [checked, setChecked] = useState({address: false, email: false});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Fields | null>(null);
  const currentReview = review && review.draft.address === draft.address && review.draft.email === draft.email ? review : null;
  const options = currentReview ? (["address", "email"] as const).filter((key) => draft[key] && draft[key] !== currentReview.stored[key]) : [];
  const patch = Object.fromEntries(options.filter((key) => checked[key]).map((key) => [key, draft[key]]));
  const failed = (e: unknown) => setError(t(e instanceof Error && e.message === "buyerChanged" ? "buyerChanged" : e instanceof Error && e.message === "buyerUnavailable" ? "buyerUnavailable" : "error"));
  return <div className="invoice-saveback">
    <div className="invoice-actions">
      <button type="button" className="text-button" disabled={disabled} onClick={async () => {
        setError(""); setSaved(null); setReview(null); onBusy(true);
        try {
          const stored = await invoiceRequest<BuyerBillingRecord>("/api/invoices/buyer-details", {...target, op: "review"});
          setReview({stored, draft});
          setChecked({address: !!draft.address && draft.address !== stored.address, email: !!draft.email && draft.email !== stored.email});
        } catch (e) { failed(e); } finally { onBusy(false); }
      }}>{t("saveBackBuyer")}</button>
      <InfoHint label={t("saveBackBuyer")} notes={[t(source.kind === "organization" ? "saveBackCompanyHelp" : "saveBackContactHelp")]} />
    </div>
    {currentReview && <section className="invoice-saveback-review" aria-label={t("saveBackBuyer")}>
      <strong>{t("saveBackTarget", {name: currentReview.stored.name, kind: t(source.kind === "organization" ? "buyerOrganization" : "buyerContact")})}</strong>
      {options.length ? options.map((key) => <label className="invoice-check invoice-saveback-choice" key={key}>
        <input type="checkbox" checked={checked[key]} disabled={disabled} onChange={(e) => setChecked({...checked, [key]: e.target.checked})} />
        <span><b>{t(key === "address" ? "buyerAddress" : "recipient")}</b>
          {currentReview.stored[key] && <span>{t("saveBackWas", {value: currentReview.stored[key]})}</span>}
          <span>{t("saveBackNew", {value: draft[key]})}</span>
        </span>
      </label>) : <p>{t("saveBackNoChanges")}</p>}
      <div className="invoice-actions">
        {options.length > 0 && <button type="button" className="secondary" disabled={disabled || !Object.keys(patch).length} onClick={async () => {
          const parsed = buyerBillingFields.safeParse({...patch, ...(patch.address && addressParts && {addressParts})});
          if (!parsed.success) {setError(t("saveBackInvalid")); return;}
          onBusy(true); setError("");
          try {
            await invoiceRequest("/api/invoices/buyer-details", {...target, op: "save", confirmed: true,
              expected: {address: currentReview.stored.address, email: currentReview.stored.email}, patch: parsed.data});
            setSaved(draft); setReview(null); router.refresh();
          } catch (e) { setReview(null); failed(e); } finally {onBusy(false);}
        }}>{t("confirmSaveBack")}</button>}
        <button type="button" className="text-button" disabled={disabled} onClick={() => {setReview(null); setError("");}}>{t("close")}</button>
      </div>
    </section>}
    {saved && saved.address === draft.address && saved.email === draft.email && <p role="status">{t("saveBackSaved")}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
