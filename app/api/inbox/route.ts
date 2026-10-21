import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listInbox } from "@/lib/data/inbox";
import { PAGE_MAX, PAGE_SIZE } from "@/lib/domain/list-page";

const flag = z.enum(["true", "false"]).transform((v) => v === "true").catch(false);
const params = z.object({
  history: flag,
  dismissed: flag,
  cursor: z.string().max(1000).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});

/**
 * One page of the signed-in talent's Intake list (decision 0011), newest
 * first: messages to review and filed, dismissed ones too with
 * `dismissed=true`, or those kept from the mailbox's history with
 * `history=true`. Unknown values fall back to the defaults.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const parsed = params.parse({ cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listInbox(current.id, parsed);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
