"use client";

import { useMemo } from "react";
import { useAppData } from "@/components/app/app-data";
import { planItems, type PlanItem } from "@/lib/calendar/planner";
import { dateInZone } from "@/lib/domain/dates";
import type { AppData } from "@/lib/types";

/** What every widget reads, worked out once per render of the overview. */
export type OverviewContext = { data: AppData; today: string; items: PlanItem[] };

export function useOverviewContext(): OverviewContext {
  const data = useAppData();
  const items = useMemo(() => planItems(data), [data]);
  return { data, today: dateInZone(data.talent.timeZone), items };
}
