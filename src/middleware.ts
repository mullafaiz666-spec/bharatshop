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

async function isValidSessionCookie(value: string | undefined) {
  if (!value) return false;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;
  const token = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const bytes = new TextEncoder().encode(`${secret}\0${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const expected = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return signature.length === expected.length && signature === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!protectedPath) return NextResponse.next();

  const validSession = await isValidSessionCookie(request.cookies.get("bharatshop_admin_session")?.value);
  if (!validSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin-login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
