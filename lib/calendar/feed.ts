import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { calendarEvent, project } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import type { IcsEvent } from "./ics";

// The subscription link carries a random secret; only its SHA-256 is stored
// (membership.calendar_feed_token_hash), so a database leak doesn't leak links.

export const newFeedToken = () => randomBytes(32).toString("base64url");
export const hashFeedToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const feedUrl = (token: string) => `${appUrl()}/api/calendar/feed/${token}.ics`;

/** Confirmed, non-archived events for one talent, ready for .ics output, described in `locale`. */
export async function feedEvents(talentId: string, locale: unknown, eventId?: string): Promise<IcsEvent[]> {
  const t = await getTranslations({ locale: toLocale(locale), namespace: "calendar" });
  const rows = await db
    .select({ event: calendarEvent, projectTitle: project.title })
    .from(calendarEvent)
    .leftJoin(project, eq(project.id, calendarEvent.projectId))
    .where(
      and(
        eq(calendarEvent.talentId, talentId),
        eq(calendarEvent.status, "confirmed"),
        isNull(calendarEvent.archivedAt),
        eventId ? eq(calendarEvent.id, eventId) : undefined,
      ),
    );
  return rows.map(({ event: e, projectTitle }) => ({
    id: e.id,
    title: e.title,
    date: e.startDate,
    time: e.startTime ? e.startTime.slice(0, 5) : null,
    timeZone: e.timeZone,
    location: e.location,
    description: [projectTitle && t("project", { title: projectTitle }), e.notes].filter(Boolean).join("\n") || null,
    updatedAt: e.updatedAt,
  }));
}
