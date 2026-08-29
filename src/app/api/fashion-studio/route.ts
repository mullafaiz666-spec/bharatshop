import { NextResponse } from "next/server";
import { FASHION_COMMANDS, runFashionCommand } from "@/lib/ai/fashion-studio";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN;
  if (!expected) return true;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return token === expected;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ status: "READY", commands: FASHION_COMMANDS });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const command = String(body.command || body.action || "").trim().toLowerCase();
    const result = await runFashionCommand({
      command,
      productId: body.productId ? Number(body.productId) : undefined,
      productName: body.productName ? String(body.productName) : undefined,
      count: body.count ? Number(body.count) : undefined,
      extraPrompt: body.extraPrompt ? String(body.extraPrompt) : undefined,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Fashion Studio failed" }, { status: 500 });
  }
}
