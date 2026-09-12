import { NextResponse } from "next/server";
import { nativeLaunchReadiness } from "@/lib/launch/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = ["1", "true", "yes"].includes(String(url.searchParams.get("deep") || "").toLowerCase());
  try {
    const readiness = await nativeLaunchReadiness(deep);
    return NextResponse.json(readiness, {
      status: readiness.readyForCutover ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      product: "BharatShop",
      status: "BLOCKED",
      readyForCutover: false,
      fullyLive: false,
      blockers: [{ gate: "probe", reason: error instanceof Error ? error.message : "launch readiness probe failed" }],
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
