import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";
import { listOpportunities } from "@/lib/data/opportunities";
import { listParams } from "@/lib/opportunities/list";

/**
 * One page of the opportunities catalogue for the signed-in person (decision
 * 0011, 0024): region, kind, closing within, following, whether to show calls
 * that don't fit, a search, and a cursor. Unknown values fall back to the defaults.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  const [row] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, current.id));
  if (!row) return new Response("Not found", { status: 404 });
  const params = listParams.parse({ region: "all", kind: "all", within: "", following: "", show: "fitting", q: "", cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listOpportunities(current.id, session.personId, row.timeZone, params);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
