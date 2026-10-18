import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";
import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { grantsLocalEnabled } from "@/lib/grants/config";
import { grantListParams, listGrantOpportunities } from "@/lib/data/grant-pages";
import { InvalidCursor } from "@/lib/data/page-cursor";
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current || !grantsLocalEnabled()) return new Response("Not found", { status: 404 });
  const [workspace] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, current.id));
  if (!workspace) return new Response("Not found", { status: 404 });
  const params = grantListParams.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!params.success) return new Response("Invalid filters", { status: 400 });
  try { return Response.json(await listGrantOpportunities(current.id, workspace.timeZone, params.data), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof InvalidCursor) return new Response("Invalid cursor", { status: 400 }); throw error; }
}
