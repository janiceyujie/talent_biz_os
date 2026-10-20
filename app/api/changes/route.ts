import { getCurrentTalent, getSession } from "@/lib/auth";
import { changeMark } from "@/lib/data/changes";

/** The signed-in talent's change mark (lib/data/changes.ts): the screens reload when it moves. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  return Response.json({ mark: await changeMark(current.id, session.personId) }, { headers: { "Cache-Control": "private, no-store" } });
}
