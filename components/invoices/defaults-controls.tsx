"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { invoiceDefaultsInput } from "@/lib/invoices/defaults";
import type { InvoiceDefaults } from "@/lib/invoices/types";
import { invoiceRequest } from "./request";

export function InvoiceDefaultsControls({ defaults, value, disabled, onApply, onBusy }: {
  defaults?: InvoiceDefaults;
  value: InvoiceDefaults;
  disabled: boolean;
  onApply: (value: InvoiceDefaults) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("invoices");
  const [saved, setSaved] = useState(defaults);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const apply = () => {
    if (!saved) return;
    onApply(saved);
    setConfirm(false);
    setError("");
    setNotice(t("defaultsApplied"));
  };
  return <div className="invoice-defaults">
    <div className="invoice-actions">
      {saved && <button type="button" className="secondary" disabled={disabled} onClick={() => {
        setNotice("");
        if (Object.keys(saved).some((key) => {
          const k = key as keyof InvoiceDefaults;
          return value[k].trim() !== "" && value[k] !== saved[k];
        })) setConfirm(true);
        else apply();
      }}>{t("applyDefaults")}</button>}
      <button type="button" className="text-button" disabled={disabled} onClick={async () => {
        setError(""); setNotice(""); setConfirm(false);
        const parsed = invoiceDefaultsInput.safeParse(value);
        if (!parsed.success) { setError(t("defaultsIncomplete")); return; }
        onBusy(true);
        try {
          setSaved(await invoiceRequest<InvoiceDefaults>("/api/invoices/defaults", parsed.data));
          setNotice(t("defaultsSaved"));
        } catch { setError(t("error")); }
        finally { onBusy(false); }
      }}>{t(saved ? "updateDefaults" : "saveDefaults")}</button>
      <InfoHint label={t("billingDefaults")} notes={[t("defaultsHelp")]} />
    </div>
    {confirm && <div className="invoice-defaults-confirm">
      <p>{t("defaultsReplace")}</p>
      <div className="invoice-actions">
        <button type="button" className="secondary" disabled={disabled} onClick={apply}>{t("confirmApplyDefaults")}</button>
        <button type="button" className="text-button" disabled={disabled} onClick={() => setConfirm(false)}>{t("keepCurrentDefaults")}</button>
      </div>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
