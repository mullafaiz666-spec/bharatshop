import { NextResponse } from "next/server";
import { readMetaCookies, sendMetaConversion, type MetaStandardEvent } from "@/lib/marketing/meta";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_EVENTS = new Set<MetaStandardEvent>(["PageView","ViewContent","AddToCart","AddToWishlist","InitiateCheckout","Search"]);
const siteOrigin = () => new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").origin;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventName = String(body.eventName || "") as MetaStandardEvent;
    const eventId = String(body.eventId || "").trim();
    const eventSourceUrl = String(body.eventSourceUrl || req.headers.get("referer") || "").trim();
    if (!PUBLIC_EVENTS.has(eventName) || !eventId || eventId.length > 128) return NextResponse.json({ error: "Unsupported Meta storefront event" }, { status: 400 });
    try { if (eventSourceUrl && new URL(eventSourceUrl).origin !== siteOrigin()) return NextResponse.json({ error: "Invalid event source" }, { status: 403 }); } catch { return NextResponse.json({ error: "Invalid event source" }, { status: 400 }); }
    const cookies = readMetaCookies(req.headers.get("cookie") || "");
    const result = await sendMetaConversion({
      eventName,
      eventId,
      eventSourceUrl: eventSourceUrl || siteOrigin(),
      clientIpAddress: (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
      fbp: cookies.fbp,
      fbc: cookies.fbc,
      customData: body.customData && typeof body.customData === "object" ? body.customData : undefined,
    });
    return NextResponse.json({ ok: result.sent, configured: result.configured, sent: result.sent, reason: "reason" in result ? result.reason : undefined }, { status: result.configured && !result.sent ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meta event failed" }, { status: 500 });
  }
}
