import { publicOrigin } from "@/lib/public-origin";
import { NextResponse } from "next/server";
import { runFashionDesigner } from "@/lib/ai/fashion-designer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await runFashionDesigner(Number(body.count || 12), publicOrigin()));
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Fashion Designer failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    status: "READY",
    agent: "AI Fashion Designer",
    pricingPolicy: "BharatShop value + BharatDrip designer dual lane",
    textProvider: "local Gemma with deterministic fallback",
    artProvider: "BharatShop SVG studio v3",
    inventoryMode: "MADE_TO_ORDER",
    brands: ["BharatShop Studio", "BharatDrip"],
    designerBandInr: [599, 999],
    ipPolicy: "original anime/manga-inspired artwork only; no unlicensed characters",
    autoPublish: "CEO-gated",
  });
}
