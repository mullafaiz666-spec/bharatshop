import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";

const ADMIN_PATHS = [
  "/api/admin",
  "/api/agent-execute",
  "/api/milestone",
  "/api/payments/diagnostics",
  "/api/marketing",
  "/dashboard",
  "/api/overview",
  "/api/cart",
  "/api/ceo-chat",
  "/api/ceo-approvals",
  "/api/ceo-research",
  "/api/agent-audit",
  "/api/agents",
  "/api/catalog",
  "/api/sourcing",
  "/api/suppliers",
  "/api/products",
  "/api/orders",
  "/api/rules",
  "/api/engine",
  "/api/shopify",
  "/api/automation",
  "/api/fashion-designer",
  "/api/fashion-studio",
];

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValidSessionCookie(value: string | undefined) {
  if (!value) return false;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  const [token, expiresText, signature, ...extra] = value.split(".");
  if (
    extra.length ||
    !/^[a-f0-9]{64}$/i.test(token || "") ||
    !/^\d{10,13}$/.test(expiresText || "") ||
    !/^[a-f0-9]{64}$/i.test(signature || "")
  ) return false;
  const expiresUnix = Number(expiresText);
  if (!Number.isSafeInteger(expiresUnix) || expiresUnix <= Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${token}.${expiresUnix}`)));
  return safeEqual(signature.toLowerCase(), expected);
}

function isAutomationAuthorized(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-automation-token") || "";
  return supplied === expected;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!protectedPath) return NextResponse.next();
  if (isAutomationAuthorized(request)) return NextResponse.next();

  const valid = await isValidSessionCookie(request.cookies.get("bharatshop_admin_session")?.value);
  if (!valid) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const response = NextResponse.redirect(new URL("/admin-login", request.url));
    response.cookies.delete("bharatshop_admin_session");
    return response;
  }
  try {
    if (!await getAdminUser()) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const response = NextResponse.redirect(new URL("/admin-login", request.url));
      response.cookies.delete("bharatshop_admin_session");
      return response;
    }
  } catch {
    return NextResponse.json({ error: "Administrator session verification unavailable" }, { status: 503 });
  }
  return NextResponse.next();
}

// Match only routes that this proxy actually protects. Public APIs such as
// /api/storefront/products must bypass Next middleware so Netlify can apply
// the hybrid Render rewrite without invoking its Next server handler.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/admin/:path*",
    "/api/agent-execute/:path*",
    "/api/milestone/:path*",
    "/api/payments/diagnostics/:path*",
    "/api/marketing/:path*",
    "/api/overview/:path*",
    "/api/cart/:path*",
    "/api/ceo-chat/:path*",
    "/api/ceo-approvals/:path*",
    "/api/ceo-research/:path*",
    "/api/agent-audit/:path*",
    "/api/agents/:path*",
    "/api/catalog/:path*",
    "/api/sourcing/:path*",
    "/api/suppliers/:path*",
    "/api/products/:path*",
    "/api/orders/:path*",
    "/api/rules/:path*",
    "/api/engine/:path*",
    "/api/shopify/:path*",
    "/api/automation/:path*",
    "/api/fashion-designer/:path*",
    "/api/fashion-studio/:path*",
  ],
};
