import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import {
  BHARATSHOP_CREATIVE_CAPABILITIES,
  createCreativeImage,
  runCreativeFashion,
} from "@/lib/creative/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function tokenAuthorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

async function authorized(req: Request) {
  if (tokenAuthorized(req)) return true;
  try {
    return Boolean(await getAdminUser());
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ status: "READY", ...BHARATSHOP_CREATIVE_CAPABILITIES });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "image").trim().toLowerCase();

    if (action === "capabilities") {
      return NextResponse.json({ status: "READY", ...BHARATSHOP_CREATIVE_CAPABILITIES });
    }

    if (action === "image") {
      const asset = await createCreativeImage({
        prompt: body.prompt,
        aspectRatio: body.aspectRatio,
        width: body.width,
        height: body.height,
        seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined,
        provider: ["auto", "free", "google"].includes(String(body.provider)) ? body.provider : "auto",
      });
      return NextResponse.json({ success: true, asset });
    }

    if (action === "fashion") {
      const result = await runCreativeFashion({
        command: body.command,
        productId: Number.isFinite(Number(body.productId)) ? Number(body.productId) : undefined,
        productName: body.productName,
        count: Number.isFinite(Number(body.count)) ? Number(body.count) : undefined,
        extraPrompt: body.extraPrompt,
      });
      return NextResponse.json(result, { status: result.success === false ? 422 : 200 });
    }

    return NextResponse.json({ error: `Unknown creative action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Creative generation failed" },
      { status: 500 },
    );
  }
}
