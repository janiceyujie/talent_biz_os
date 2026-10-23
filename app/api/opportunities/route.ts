import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
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
  const params = listParams.parse({ region: "all", kind: "all", within: "", following: "", show: "fitting", q: "", cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listOpportunities(current.id, session.personId, params);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
