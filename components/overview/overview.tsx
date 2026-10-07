"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ANALYSIS_POLL_MS } from "@/components/app/paste-dialog";
import { Toast } from "@/components/app/toast";
import { overviewLayout } from "@/lib/overview/layout";
import { useOverviewContext } from "./context";
import { CustomizeOverview } from "./customize";
import { widgetViews } from "./registry";

/**
 * Today's widgets in two columns (main: act on; side: time and money),
 * arranged by lib/overview/layout: the role's defaults, changed by what the
 * person saved (Customize Today). On narrow screens the columns stack, main first.
 * Every widget that's on shows, with its own empty state.
 */
export function Overview() {
  const ctx = useOverviewContext();
  const t = useTranslations("today");
  const saved = ctx.data.preferences["overview.layout"];
  const layout = overviewLayout(ctx.data.person.role, saved);
  const [customizing, setCustomizing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // A message imported from the header is analyzed in the background: look again until it lands.
  const analyzing = ctx.data.inbox.some((m) => m.status === "pending");
  const router = useRouter();
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => router.refresh(), ANALYSIS_POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, router]);
  const nothingShown = !layout.main.length && !layout.side.length;
  return (
    <>
      {nothingShown ? (
        <p className="empty">{t("allHidden")}</p>
      ) : (
        <div className="today-layout">
          {(["main", "side"] as const).map((column) => (
            <div key={column} className={`overview-column overview-${column}`}>
              {layout[column].map((id) => {
                const View = widgetViews[id];
                return <View key={id} ctx={ctx} />;
              })}
            </div>
          ))}
        </div>
      )}
      <div className="overview-footer">
        <button className="text-button" onClick={() => setCustomizing(true)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          {t("customize")}
        </button>
      </div>
      {customizing && (
        <CustomizeOverview
          role={ctx.data.person.role}
          saved={saved}
          onClose={() => setCustomizing(false)}
          onDone={(message) => {
            setCustomizing(false);
            setToast(message);
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
