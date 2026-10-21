import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { inboxDetail } from "@/lib/data/inbox";

/**
 * One message in full, for the signed-in talent only — its analysis, files,
 * and email thread, fetched when it's opened instead of loaded with every page.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inbox/[id]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  const { id } = await ctx.params;
  if (!current || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const detail = await inboxDetail(current.id, id);
  if (!detail) return new Response("Not found", { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } });
}
