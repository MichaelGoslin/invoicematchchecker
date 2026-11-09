import { type NextRequest, NextResponse } from "next/server";
import { gateMode, isValidSession, SESSION_COOKIE } from "./lib/auth/session";

/** The only page anyone can open signed out. Compared exactly, so /loginx or /login/anything stay gated. */
export const PUBLIC_PATHS = new Set(["/login"]);

/** Gates every page and API route behind the shared passcode (APP_PASSCODE). */
export async function proxy(request: NextRequest) {
  const mode = gateMode();
  if (mode === "open-dev") return NextResponse.next();
  if (mode === "misconfigured") {
    return new NextResponse("APP_PASSCODE is not set for this deployment.", { status: 503 });
  }
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  const ok = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, process.env.APP_PASSCODE!);
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own static files and the favicon. The login page is let
  // through above by exact path, not here: a prefix in this pattern would also skip
  // any path that starts with the same letters.
  matcher: ["/((?!_next/static/|_next/image$|_next/image/|favicon\\.ico$).*)"],
};
