import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { appUrl, feedEvents } from "@/lib/calendar/feed";
import { buildCalendar } from "@/lib/calendar/ics";

/** One event as a downloadable .ics file, for the signed-in talent only. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/calendar/events/[id]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  const { id } = await ctx.params;
  if (!current || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const [event] = await feedEvents(current.id, id);
  if (!event) return new Response("Not found", { status: 404 });
  return new Response(buildCalendar([event], { name: current.name, host: new URL(appUrl()).host }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${event.date}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
