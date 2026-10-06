import type { ComponentType } from "react";
import type { WidgetId } from "@/lib/overview/widgets";
import type { OverviewContext } from "./context";
import { ActionsWidget } from "./widgets/actions";
import { IncomeWidget } from "./widgets/income";
import { MoneyWidget } from "./widgets/money";
import { PipelineWidget } from "./widgets/pipeline";
import { ScheduleWidget } from "./widgets/schedule";
import { StalledWidget } from "./widgets/stalled";

/** Each widget id's view. A Record, so a new id in lib/overview/widgets.ts without a view here doesn't compile. */
export const widgetViews: Record<WidgetId, ComponentType<{ ctx: OverviewContext }>> = {
  actions: ActionsWidget,
  stalled: StalledWidget,
  pipeline: PipelineWidget,
  schedule: ScheduleWidget,
  money: MoneyWidget,
  income: IncomeWidget,
};

/** Each widget's name (its title, in the "today" messages), for the editor. */
export const widgetTitleKey = {
  actions: "actionsTitle",
  stalled: "stalledTitle",
  pipeline: "pipelineTitle",
  schedule: "todaySchedule",
  money: "money",
  income: "incomeTitle",
} as const satisfies Record<WidgetId, string>;
