import type { NextRequest } from "next/server";
import { z } from "zod";
import { listConversations } from "@/lib/assistant/conversations";
import { getCurrentTalent, getSession } from "@/lib/auth";

const params = z.object({ cursor: z.string().max(1000).catch("") });

/** One page of the signed-in person's assistant conversations, latest first (decision 0023). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const { cursor } = params.parse({ cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  return Response.json(await listConversations(session.personId, current.id, cursor), { headers: { "Cache-Control": "private, no-store" } });
}
