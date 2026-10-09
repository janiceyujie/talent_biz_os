import type { Payment } from "@/lib/types";

type ExamplePayment = {
  id: string;
  projectId: string | null;
  projectType: Payment["projectType"];
  direction: Payment["direction"];
  label: string;
  amount: number;
  daysFromToday: number | null;
};

// Synthetic records stay in the example flow and never enter PostgreSQL.
const examplePayments: ExamplePayment[] = [
  { id: "brand-balance", projectId: "brand", projectType: "brand_deal", direction: "in", label: "Brand campaign balance [Sample]", amount: 48000, daysFromToday: 7 },
  { id: "festival-deposit", projectId: "show", projectType: "gig", direction: "in", label: "Festival performance deposit [Sample]", amount: 60000, daysFromToday: 14 },
  { id: "podcast-sponsor", projectId: null, projectType: "other", direction: "in", label: "Podcast sponsorship [Sample]", amount: 30000, daysFromToday: 21 },
  { id: "video-balance", projectId: "film", projectType: "brand_deal", direction: "in", label: "Video production balance [Sample]", amount: 10000, daysFromToday: 30 },
  { id: "creator-license", projectId: "audio", projectType: "sponsored_post", direction: "in", label: "Creator usage license [Sample]", amount: 40000, daysFromToday: 44 },
  { id: "music-license", projectId: "license", projectType: "licensing", direction: "in", label: "Music license renewal [Sample]", amount: 20000, daysFromToday: 65 },
  { id: "editor-fee", projectId: "film", projectType: "brand_deal", direction: "out", label: "Freelance editing fee [Sample]", amount: 15000, daysFromToday: 5 },
  { id: "travel-cost", projectId: "show", projectType: "gig", direction: "out", label: "Performance travel [Sample]", amount: 10000, daysFromToday: 12 },
  { id: "studio-rent", projectId: null, projectType: "other", direction: "out", label: "Studio rental [Sample]", amount: 18000, daysFromToday: 30 },
  { id: "equipment-rental", projectId: "film", projectType: "brand_deal", direction: "out", label: "Equipment rental [Sample]", amount: 8000, daysFromToday: 40 },
  { id: "manager-fee", projectId: "brand", projectType: "brand_deal", direction: "out", label: "Management commission [Sample]", amount: 20000, daysFromToday: 58 },
  { id: "tax-reserve", projectId: null, projectType: "other", direction: "out", label: "Tax reserve [Sample]", amount: 12000, daysFromToday: 87 },
  { id: "overdue-receivable", projectId: "audio", projectType: "sponsored_post", direction: "in", label: "Overdue invoice [Sample]", amount: 20000, daysFromToday: -3 },
  { id: "missing-date-payable", projectId: null, projectType: "other", direction: "out", label: "Unscheduled expense [Sample]", amount: 5000, daysFromToday: null },
];

/** A varied 90-day ledger for the clearly marked example mode. */
export function cashScenarioExample(today: string, currency: Payment["currency"] = "TWD"): Payment[] {
  const start = new Date(`${today}T12:00:00Z`);
  return examplePayments.map((item) => {
    const dueDate = item.daysFromToday === null ? null : (() => {
      const due = new Date(start);
      due.setUTCDate(due.getUTCDate() + item.daysFromToday);
      return due.toISOString().slice(0, 10);
    })();
    return {
      id: `cash-demo-${item.id}`,
      projectId: item.projectId,
      projectType: item.projectType,
      installment: "regular",
      direction: item.direction,
      label: item.label,
      amount: item.amount,
      currency,
      taxRate: 5,
      taxIncluded: false,
      recordedDate: today,
      dueDate,
      status: "expected",
      settledAmount: null,
      settledDate: null,
      invoiceRef: "",
      notes: "Synthetic example; not a real receivable or payable.",
      voided: false,
    };
  });
}
