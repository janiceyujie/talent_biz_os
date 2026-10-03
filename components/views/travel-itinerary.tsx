"use client";

import { CarFront, Hotel, MapPin, Plane, TrainFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, type Editor } from "@/components/app/record-editor";
import { TravelSummary } from "@/components/app/travel-summary";
import { YourTime } from "@/components/app/your-time";
import { calendarPoints, pointKind, type CalendarPoint } from "@/lib/calendar/points";
import { dateInZone } from "@/lib/domain/dates";
import { isSigned } from "@/lib/domain/phases";
import type { Project } from "@/lib/types";

const icon = (p: CalendarPoint) => {
  const { kind, travel } = p.item;
  if (kind === "accommodation") return Hotel;
  if (kind !== "travel") return MapPin;
  if (travel?.transportMode === "flight") return Plane;
  if (travel?.transportMode === "high_speed_rail" || travel?.transportMode === "train") return TrainFront;
  return CarFront;
};

/** A project's travel, stays, and performances in time order, each marker in its own local time. */
export function TravelItinerary({ project, edit }: { project: Project; edit: (e: Editor) => void }) {
  const data = useAppData();
  const t = useTranslations("itinerary");
  const tCalendar = useTranslations("calendar");
  const points = calendarPoints(
    data.calendar.filter(
      (c) => c.projectId === project.id && !c.archived && ["travel", "accommodation", "performance"].includes(c.kind),
    ),
  ).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.key.localeCompare(b.key));
  const canAdd = !project.archived && isSigned(project.stage);
  const add = (kind: "travel" | "accommodation") =>
    edit({
      kind: "calendar",
      item: { kind, projectId: project.id, date: project.nextAction?.dueDate || dateInZone(data.talent.timeZone) },
    });

  return (
    <section className="travel-itinerary">
      <div className="section-header">
        <h3>{t("title")}</h3>
        <div className="toolbar wrap">
          <button className="secondary" disabled={!canAdd} onClick={() => add("travel")}>
            {t("addTravel")}
          </button>
          <button className="secondary" disabled={!canAdd} onClick={() => add("accommodation")}>
            {t("addStay")}
          </button>
        </div>
      </div>
      {!points.length && <p className="muted">{t("empty")}</p>}
      <div className="travel-timeline">
        {points.map((p) => {
          const Icon = icon(p);
          const marker = pointKind(p);
          return (
            <article className="travel-stop" key={p.key}>
              <span className="travel-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="travel-stop-body">
                <div className="travel-stop-heading">
                  <button className="text-button left" onClick={() => edit({ kind: "calendar", item: calendarRecord(p.item) })}>
                    <strong>{p.item.title}</strong>
                  </button>
                  <span className="tag">{marker ? tCalendar(`point.${marker}`) : t("performance")}</span>
                </div>
                <p className="travel-time">
                  {p.date} · {p.time || tCalendar("noTime")} <span>{p.timeZone}</span>
                </p>
                <YourTime date={p.date} time={p.time} timeZone={p.timeZone} />
                {p.item.travel ? (
                  <details>
                    <summary>{t("details")}</summary>
                    <TravelSummary item={p.item} />
                  </details>
                ) : (
                  p.item.location && <p>{p.item.location}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
