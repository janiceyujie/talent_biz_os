import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { fileListParams, listFiles } from "@/lib/data/files";
import { InvalidCursor } from "@/lib/data/page-cursor";
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  const params = fileListParams.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!params.success) return new Response("Invalid filters", { status: 400 });
  try { return Response.json(await listFiles(current.id, params.data), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof InvalidCursor) return new Response("Invalid cursor", { status: 400 }); throw error; }
}
