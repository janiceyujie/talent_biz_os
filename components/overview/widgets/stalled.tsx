"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { phaseOf } from "@/lib/domain/phases";
import { STALLED_DAYS, stalledDeals } from "@/lib/overview/stalled";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

const SHOWN = 5;

/** Gone quiet: deals in negotiation with no news for a while, quietest first; otherwise says all is moving (or that there are none). */
export function StalledWidget({ ctx: { data, today } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const router = useRouter();
  const deals = stalledDeals({ projects: data.projects, inbox: data.inbox, today, timeZone: data.talent.timeZone });
  const negotiating = data.projects.filter((p) => !p.archived && phaseOf(p.stage) === "negotiation").length;
  return (
    <Widget id="stalled" title={t("stalledTitle")} count={deals.length}>
      {!deals.length && (
        <p className="empty">{negotiating ? t("stalledNone", { count: negotiating, days: STALLED_DAYS }) : t("stalledNoDeals")}</p>
      )}
      {deals.slice(0, SHOWN).map(({ project, quietDays }) => (
        <button key={project.id} className="today-action" onClick={() => router.push(`/projects?id=${project.id}`)}>
          <span className="reminder-status">{t("stalledDays", { days: quietDays })}</span>
          <span>
            <strong>{project.title}</strong>
            <small>{project.counterparty}</small>
          </span>
        </button>
      ))}
    </Widget>
  );
}
