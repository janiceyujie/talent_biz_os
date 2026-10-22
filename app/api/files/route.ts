import type { NextRequest } from "next/server";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listFiles, fileListParams } from "@/lib/data/files";



/**
 * One page of the signed-in talent's files (decision 0011), newest first: one
 * project's or all, archived ones with `archived=true`, and a search of the
 * name. Unknown values fall back to the defaults.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const parsed = fileListParams.parse({ project: "", q: "", cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listFiles(current.id, parsed);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
