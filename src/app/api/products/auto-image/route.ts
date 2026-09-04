import { NextResponse } from "next/server";
import { runAutomaticProductImage } from "@/lib/ai/auto-image";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runAutomaticProductImage({ productId: body.productId ? Number(body.productId) : undefined, productName: body.productName ? String(body.productName) : undefined, count: body.count ? Number(body.count) : undefined, purpose: body.purpose, extraPrompt: body.extraPrompt ? String(body.extraPrompt) : undefined });
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Automatic image generation failed" }, { status: 500 });
  }
}
