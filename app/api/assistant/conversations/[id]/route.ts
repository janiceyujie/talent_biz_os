import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteConversation, getConversation } from "@/lib/assistant/conversations";
import { getCurrentTalent, getSession } from "@/lib/auth";

/** One of the signed-in person's conversations with its messages; anyone else's is "not found" (decision 0023). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/assistant/conversations/[id]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  const { id } = await ctx.params;
  if (!current || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const conversation = await getConversation(session.personId, current.id, id);
  if (!conversation) return new Response("Not found", { status: 404 });
  return Response.json(conversation, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Deletes one of the signed-in person's conversations and its messages, for good. A request from
 * another site can't send DELETE with the person's cookie without a CORS preflight, which this route
 * never answers.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/assistant/conversations/[id]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !(await deleteConversation(session.personId, id))) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
