import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listOpportunities } from "@/lib/data/opportunities";
import { listParams } from "@/lib/opportunities/list";

/**
 * One page of the opportunities catalogue for the signed-in person (decision
 * 0011, 0024): region, kind, closing within, the tab (You can apply, Doesn't
 * fit, Following), a search, and a cursor. Unknown values fall back to the
 * defaults. Each tab's count comes with every page.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  const params = listParams.parse({ region: "all", kind: "all", within: "", tab: "canApply", q: "", cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listOpportunities(current.id, session.personId, params);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
