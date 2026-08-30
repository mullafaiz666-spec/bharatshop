import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { resolveVerifiedMediaForProducts } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!process.env.BHARATSHOP_AUTOMATION_TOKEN || token !== process.env.BHARATSHOP_AUTOMATION_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));

    const targets = body.productId
      ? await db.select().from(products).where(eq(products.id, Number(body.productId))).limit(1)
      : await db.select().from(products).where(eq(products.status, "Published")).orderBy(asc(products.id)).limit(limit);

    const results = await resolveVerifiedMediaForProducts(targets, Math.min(limit, 100));

    return NextResponse.json({
      status: "COMPLETED",
      provider: "searxng+claude-vision",
      processed: results.length,
      resolved: results.filter((r) => r.status === "COMPLETE_MEDIA_RESOLVED").length,
      needsImages: results.filter((r) => r.status === "NEEDS_IMAGES").length,
      failed: results.filter((r) => r.status === "ERROR" || r.status === "VERIFICATION_FAILED").length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Media resolver failed" }, { status: 500 });
  }
}
