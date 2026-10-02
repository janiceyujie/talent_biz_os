import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { feedEvents, hashFeedToken, appUrl } from "@/lib/calendar/feed";
import { buildCalendar } from "@/lib/calendar/ics";
import { db } from "@/lib/db";
import { membership, talent } from "@/lib/db/schema";

// Calendar apps fetch this without a session; the secret in the URL is the
// credential. Unknown, reset, or revoked links get a plain 404.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/calendar/feed/[token]">) {
  const { token } = await ctx.params;
  const secret = token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return new Response("Not found", { status: 404 });

  const [owner] = await db
    .select({ talentId: talent.id, name: talent.name })
    .from(membership)
    .innerJoin(talent, eq(talent.id, membership.talentId))
    .where(and(eq(membership.calendarFeedTokenHash, hashFeedToken(secret)), eq(membership.status, "active")));
  if (!owner) return new Response("Not found", { status: 404 });

  const body = buildCalendar(await feedEvents(owner.talentId), {
    name: `${owner.name} · Talent Biz OS`,
    host: new URL(appUrl()).host,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
