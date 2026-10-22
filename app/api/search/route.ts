import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { searchWorkspaceItems } from "@/lib/data/search";
import { RECENT_MAX } from "@/lib/workspace-search";

const params = z.object({
  q: z.string().max(200).catch(""),
  recent: z.string().max(RECENT_MAX * 60).catch(""), // the browser's remembered picks, comma-separated "<kind>:<id>"
});

/** The ⌘K search over the signed-in talent's workspace: matches for `q`, or with none, suggestions starting from `recent`. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const { q, recent } = params.parse({ q: "", recent: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const result = await searchWorkspaceItems(current.id, q, recent.split(",").filter(Boolean).slice(0, RECENT_MAX));
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
