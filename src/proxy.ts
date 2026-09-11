import { NextRequest, NextResponse } from "next/server";

const ADMIN_PATHS = [
  "/api/admin",
  "/api/agent-execute",
  "/api/milestone",
  "/api/payments/diagnostics",
  "/api/marketing",
  "/dashboard",
  "/api/overview",
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
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
