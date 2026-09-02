import { NextRequest, NextResponse } from "next/server";

const ADMIN_PATHS = [
  "/dashboard",
  "/api/overview",
  "/api/ceo-chat",
  "/api/ceo-approvals",
  "/api/agent-audit",
  "/api/agents",
  "/api/catalog",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!protectedPath) return NextResponse.next();

  // Scheduled research is a non-customer, machine-to-machine route. The route
  // itself performs a constant-time-equivalent secret equality check; middleware
  // only needs to let the request reach that authorization boundary.
  if (pathname === "/api/agents/research" && request.headers.has("x-bharatshop-automation-token")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("bharatshop_admin_session")?.value;
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin-login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
