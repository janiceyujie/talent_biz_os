import { dateInZone } from "./dates";
import type { NotificationState } from "@/lib/types";
import type { StatefulNotification } from "./notifications";

export function snoozeReady(id: string, state: NotificationState, now: Date) {
  const item = state[id];
  return !!item?.snoozedUntil && !item.readAt && Date.parse(item.snoozedUntil) <= now.getTime();
}
/** Today's agenda, overdue action items, and explicitly postponed reminders. */
export function briefingItems(items: StatefulNotification[], state: NotificationState, now: Date, zone: string) {
  const day = dateInZone(zone, 0, now);
  return items.filter(n => {
    if (n.snoozedUntil) return false;
    if (snoozeReady(n.id, state, now)) return true;
    if (n.kind === "calendar" && n.source === "event") {
      const localDay = n.time && n.dueAt !== null ? dateInZone(zone, 0, new Date(n.dueAt)) : n.date;
      return localDay === day;
    }
    return n.date <= day;
  });
}

/** Manager reminders use only the authorized selection, never owner or stale fallback records. */
export function portfolioReminderData(own: import("@/lib/types").AppData, workspace?: import("@/lib/manager/workspace-types").PortfolioWorkspace): import("@/lib/types").AppData {
  const ids = new Set(workspace?.selectedIds ?? []);
  return {...own, preview:false, previewDate:undefined,
    calendar:(workspace?.calendar ?? []).filter(row=>ids.has(row.artistId)).map(row=>({...row,title:`${row.artistName} · ${row.title}`})),
    payments:(workspace?.payments ?? []).filter(row=>ids.has(row.artistId)).map(row=>({...row,label:`${row.artistName} · ${row.label}`})),
    projects:workspace?.projects ?? [], externalEvents:[]};
}
