import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { inboxDetail } from "@/lib/data/inbox";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response("Invalid id", { status: 400 });
  const result = await inboxDetail(current.id, id);
  return result ? Response.json(result, { headers: { "Cache-Control": "private, no-store" } }) : new Response("Not found", { status: 404 });
}
