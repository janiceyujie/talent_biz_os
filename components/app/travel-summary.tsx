"use client";

import { useTranslations } from "next-intl";
import { useLabels } from "@/lib/i18n/labels";
import type { CalendarItem } from "@/lib/types";

/** Ticket or booking details of a travel or stay event: what was entered, never looked up. */
export function TravelSummary({ item }: { item: CalendarItem }) {
  const t = useTranslations("calendar");
  const labels = useLabels();
  const travel = item.travel;
  if (!travel) return null;
  const join = (parts: string[]) => parts.filter(Boolean).join(" · ");
  const end = travel.endDate && `${travel.endDate} ${travel.endTime} · ${travel.endTimeZone}`;
  const lines =
    item.kind === "accommodation"
      ? [
          join([travel.hotelName, item.location]),
          t("travel.checkIn", { when: `${item.date} ${item.time} · ${item.timeZone}` }),
          end ? t("travel.checkOut", { when: end }) : t("travel.noCheckOut"),
        ]
      : [
          join([
            travel.transportMode && labels.transportMode(travel.transportMode),
            travel.operator,
            travel.serviceNumber,
            travel.seat && t("travel.seat", { seat: travel.seat }),
          ]),
          [item.location, travel.destination].filter(Boolean).join(" → "),
          end ? t("travel.arrives", { when: end }) : t("travel.noArrival"),
        ];
  return (
    <div className="travel-detail">
      {lines.filter(Boolean).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {item.notes && <p className="muted">{item.notes}</p>}
    </div>
  );
}
