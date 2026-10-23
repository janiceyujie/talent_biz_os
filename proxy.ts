import { type NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/auth/cookie";
import { PASSWORD_PROMPT, sitePasswordAllows } from "@/lib/auth/site-password";

// Runs on every request (no matcher), so the staging password (decision 0027)
// covers API routes and static files too. It's unset in production and locally.
//
// Then, on pages only, optimistic redirects. Pages still verify the session
// against the database through lib/auth (requirePerson / requireTalent). A
// cookie alone never sends anyone away from the auth pages: it can be expired,
// or signed with an old secret, and the app would send them straight back (a
// loop that only clearing cookies ended). Sign-in and sign-up check the real session.
const authPages = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];
// The paths the redirects used to be limited to by a matcher.
const page = /^\/(?!api|_next\/static|_next\/image|favicon\.ico|.*\.(?:svg|png|jpg|ico)$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!sitePasswordAllows(pathname, request.headers.get("authorization"), process.env.SITE_PASSWORD)) {
    return new NextResponse("Password required", { status: 401, headers: PASSWORD_PROMPT });
  }
  if (!page.test(pathname)) return NextResponse.next();

  const signedIn = hasSessionCookie(request);
  const onAuthPage = authPages.includes(pathname);

  if (!signedIn && !onAuthPage) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}
