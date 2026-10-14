import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireManagerCapability } from "@/lib/data/manager-entitlement";
import { getManagerRoster } from "@/lib/data/manager";
import { managerLocalEnabled } from "@/lib/manager/config";
import { ManagerScopeError, selectManagedArtists } from "@/lib/manager/scope";

/** Lightweight authorization lease for already-open read-only artist views. */
export async function GET(request: NextRequest) {
  const response = (body: object, status = 200) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  const person = await getSession();
  if (!person) return response({ error: "unauthorized" }, 401);
  if (!managerLocalEnabled()) return response({ error: "not_found" }, 404);
  const params = request.nextUrl.searchParams;
  const ids = params.get("artist") === "none" ? [] : params.getAll("artist");
  try {
    const capability = await requireManagerCapability(person.personId);
    selectManagedArtists(await getManagerRoster(person.personId), ids, capability.artistLimit);
    return response({ allowed: true });
  } catch (error) {
    if (error instanceof ManagerScopeError) return response({ error: error.code }, 403);
    throw error;
  }
}
