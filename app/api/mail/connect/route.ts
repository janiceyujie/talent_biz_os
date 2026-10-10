import { type NextRequest, NextResponse } from "next/server";
import { requireTalent } from "@/lib/auth";
import { startConnect } from "@/lib/mail/connect";
import { historyModes, type HistoryMode } from "@/lib/mail/history";
import { STATE_COOKIE, STATE_TTL_SECONDS } from "@/lib/mail/oauth-state";

// Settings → Connect Gmail: off to Google's consent screen (decision 0013).
export async function GET(req: NextRequest) {
  const { person, talent } = await requireTalent();
  const asked = req.nextUrl.searchParams.get("history");
  const historyMode: HistoryMode = historyModes.includes(asked as HistoryMode) ? (asked as HistoryMode) : "30_days";
  const started = startConnect({ personId: person.personId, talentId: talent.id, historyMode });
  if ("error" in started) return NextResponse.redirect(new URL(`/settings?gmail=${started.error}`, req.url));
  const res = NextResponse.redirect(started.url);
  res.cookies.set(STATE_COOKIE, started.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // behind a proxy the request itself may look like http
    sameSite: "lax", // sent on Google's redirect back, a top-level navigation
    path: "/api/mail",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
