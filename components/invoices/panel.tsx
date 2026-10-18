"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { useAppData } from "@/components/app/app-data";
import { useReminderFeed } from "@/components/app/reminder-feed";
import { InfoHint } from "@/components/app/info-hint";
import { PageLoader, useCursorPages } from "@/components/app/cursor-pages";
import { dateInZone } from "@/lib/domain/dates";
import { invoiceState } from "@/lib/invoices/domain";
import type {
  InvoiceDetail,
  InvoiceSummary,
  InvoiceDefaults,
} from "@/lib/invoices/types";
import { InvoiceEditor } from "./editor";
import { InvoiceReview } from "./review";
import { invoiceRequest } from "./request";

export function InvoicePanel({ projectId, requestedPaymentId, onDismiss }: { projectId?: string; requestedPaymentId?: string; onDismiss?: () => void }) {
  const data = useAppData(),
    t = useTranslations("invoices"),
    router = useRouter(),
    pathname = usePathname(),
    searchParams = useSearchParams();
  const { reload: reloadReminders } = useReminderFeed();
  const readyOnly = searchParams.get("invoiceView") === "review";
  const setReviewFilter = (ready: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (ready) params.set("invoiceView", "review");
    else params.delete("invoiceView");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}#invoices`, { scroll: false });
  };
  const [open, setOpen] = useState(false),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false),
    [row, setRow] = useState<InvoiceDetail | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const page = useCursorPages<InvoiceSummary>(
    `/api/invoices?project=${projectId || ""}&ready=${readyOnly ? "1" : "0"}`,
    data.talent.id,
    revision,
    open && !data.preview,
  );
  useEffect(() => {
    const reveal = () => {
      if (location.hash === "#invoices") setOpen(true);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const [initialPaymentId, setInitialPaymentId] = useState<string>();
  const [defaults, setDefaults] = useState<InvoiceDefaults>();
  const [availablePayments, setAvailablePayments] = useState<string[]>([]);
  const create = async () => {
    setInitialPaymentId(undefined);
    setLoading(true);
    setError("");
    try {
      setDefaults(
        (await invoiceRequest<InvoiceDefaults | null>(
          "/api/invoices/defaults",
        )) || undefined,
      );
      const candidates = data.payments.filter((p) => !projectId || p.projectId === projectId).map((p) => p.id);
      const available: string[] = [];
      for (let offset = 0; offset < candidates.length; offset += 200) {
        available.push(...await invoiceRequest<string[]>("/api/invoices/payment-availability", {
          paymentIds: candidates.slice(offset, offset + 200),
        }));
      }
      setAvailablePayments(available);
      setCreating(true);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  };
  const today = dateInZone(data.talent.timeZone);
  const review = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const [detail, billingDefaults] = await Promise.all([
        invoiceRequest<InvoiceDetail>(`/api/invoices/${id}`),
        invoiceRequest<InvoiceDefaults | null>("/api/invoices/defaults"),
      ]);
      setDefaults(billingDefaults || undefined);
      setRow(detail);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  };
  const handledPayment = useRef("");
  const linkedPayment = requestedPaymentId || searchParams.get("invoicePayment");
  const paymentReady = !requestedPaymentId || data.payments.some(p => p.id === requestedPaymentId);
  useEffect(() => {
    if (!linkedPayment) { handledPayment.current = ""; return; }
    const requestKey = `${data.talent.id}:${linkedPayment}`;
    if (handledPayment.current === requestKey || !paymentReady || !/^[0-9a-f-]{36}$/.test(linkedPayment) || data.preview) return;
    let active = true;
    queueMicrotask(() => { if (active) {setOpen(true);setLoading(true);setError("");} });
    Promise.all([invoiceRequest<string[]>("/api/invoices/payment-availability",{paymentIds:[linkedPayment]}),invoiceRequest<InvoiceDefaults | null>("/api/invoices/defaults")])
      .then(([available,billing]) => {
        if (!active) return;
        if (!available.includes(linkedPayment)) {setError(t("error"));return;}
        handledPayment.current = requestKey;
        setDefaults(billing || undefined);setAvailablePayments(available);setInitialPaymentId(linkedPayment);setCreating(true);
      }).catch(() => {if(active)setError(t("error"));}).finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[linkedPayment,paymentReady,data.preview,data.talent.id,t]);
  const linkedInvoice = searchParams.get("invoice");
  useEffect(() => {
    if (!linkedInvoice || !/^[0-9a-f-]{36}$/.test(linkedInvoice) || data.preview) return;
    let active = true;
    queueMicrotask(() => { if (active) {setOpen(true); setLoading(true); setError("");} });
    Promise.all([invoiceRequest<InvoiceDetail>(`/api/invoices/${linkedInvoice}`), invoiceRequest<InvoiceDefaults | null>("/api/invoices/defaults")])
      .then(([detail, billing]) => { if (active) { setRow(detail); setDefaults(billing || undefined); } })
      .catch(() => { if (active) setError(t("error")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [linkedInvoice, data.preview, t]);
  const clearLink = () => {
    if (!linkedInvoice && !searchParams.get("invoicePayment")) return;
    const params = new URLSearchParams(searchParams.toString()); params.delete("invoice"); params.delete("invoicePayment");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}#invoices`, {scroll:false});
  };
  const changed = (updated?: InvoiceDetail) => {
    setError("");
    void reloadReminders();
    clearLink();
    onDismiss?.();
    setRow(updated || null);
    setCreating(false);
    setEditing(false);
    setRevision((x) => x + 1);
    router.refresh();
  };
  return (
    <section id="invoices" className="surface invoice-panel">
      <div className="invoice-heading">
        <button
          type="button"
          className="text-button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <FileText size={19} />
          <strong>{t("title")}</strong>
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        <InfoHint label={t("title")} notes={[t("help")]} />
      </div>
      {open && (
        <div className="invoice-panel-body">
          <div className="invoice-actions">
            <button
              className="secondary"
              disabled={!!data.preview || loading}
              onClick={create}
            >
              <Plus size={16} />
              {t("create")}
            </button>
            <button
              className="text-button"
              onClick={() => setRevision((x) => x + 1)}
            >
              {t("refresh")}
            </button>
          </div>
          <div className="invoice-filters" role="group" aria-label={t("filterLabel")}>
            <button type="button" className="text-button" aria-pressed={!readyOnly} onClick={() => setReviewFilter(false)}>{t("filterAll")}</button>
            <button type="button" className="text-button" aria-pressed={readyOnly} onClick={() => setReviewFilter(true)}>{t("filterReview")}</button>
          </div>
          {!page.loading && !page.items.length && !page.failed && (
            <p className="muted" role="status">{t(readyOnly ? "reviewEmpty" : "empty")}</p>
          )}
          <ul className="invoice-list">
            {page.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => review(item.id)}
                  disabled={loading}
                >
                  <span>
                    <strong>{item.number}</strong>
                    <span>{item.buyerName}</span>
                    <small>{t(`documentKinds.${item.documentKind || "commercial_invoice"}`)}</small>
                  </span>
                  <span>
                    <b>
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: item.currency || "USD",
                        currencyDisplay: "code",
                      }).format(item.total)}
                    </b>
                    <span
                      className={`invoice-status is-${invoiceState(item.status, item.paid, item.dueOn, today)}`}
                    >
                      {t(
                        `statuses.${invoiceState(item.status, item.paid, item.dueOn, today)}`,
                      )}
                    </span>
                  </span>
                  <span>
                    <small>{t("dueOn")}</small>
                    {item.dueOn}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <PageLoader page={page} />
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {(creating || editing) && (
        <InvoiceEditor
          initialPaymentId={initialPaymentId}
          defaults={defaults}
          availablePayments={editing ? undefined : availablePayments}
          projectId={projectId}
          existing={editing && row ? row : undefined}
          onClose={() => {
            setCreating(false);
            setEditing(false);
            clearLink();
            onDismiss?.();
          }}
          onSaved={(id) => {
            changed();
            void review(id);
          }}
        />
      )}
      {row && !editing && (
        <InvoiceReview
          key={`${row.id}:${row.revision}:${row.status}`}
          row={row}
          onClose={() => { setRow(null); clearLink(); onDismiss?.(); }}
          onEdit={() => setEditing(true)}
          onChanged={changed}
        />
      )}
    </section>
  );
}
export function InvoiceNotice() {
  const data = useAppData(),
    t = useTranslations("invoices"),
    [count, setCount] = useState(0);
  useEffect(() => {
    if (data.preview) return;
    const c = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/invoices?ready=1&count=1", {
        signal: c.signal,
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (r && !c.signal.aborted) setCount(r.total);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      c.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data.preview, data.talent.id]);
  return !data.preview && count ? (
    <div className="notice invoice-notice">
      <FileText size={18} />
      <span>{t("pendingNotice", { count })}</span>
      <Link href="/finance?invoiceView=review#invoices">{t("openFinance")}</Link>
    </div>
  ) : null;
}
