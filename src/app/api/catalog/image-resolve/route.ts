import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";

const APPROVED = new Set(["AI_VISION_VERIFIED"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!process.env.BHARATSHOP_AUTOMATION_TOKEN || token !== process.env.BHARATSHOP_AUTOMATION_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(body.limit || 10)));

    const all = await db.select().from(products).where(eq(products.status, "Published")).orderBy(asc(products.id));
    const imgs = await db.select().from(productImages);
    const counts = new Map<number, number>();
    for (const x of imgs) {
      if (APPROVED.has(String(x.verificationStatus)) && !BAD.test(x.imageUrl)) {
        counts.set(x.productId, (counts.get(x.productId) || 0) + 1);
      }
    }
    const candidates = all.filter((p) => (counts.get(p.id) || 0) < 8).slice(0, limit);

    const results = [];
    for (const p of candidates) {
      results.push(await resolveVerifiedProductMedia(p.id));
    }

    return NextResponse.json({
      status: "COMPLETED",
      provider: "searxng+claude-vision",
      processed: candidates.length,
      resolved: results.filter((r: any) => r.status === "COMPLETE_MEDIA_RESOLVED").length,
      needsImages: results.filter((r: any) => r.status === "NEEDS_IMAGES").length,
      failed: results.filter((r: any) => r.status === "VERIFICATION_FAILED").length,
      results,
      policy: `Every published product requires ${4}-${8} Claude-vision-verified images. A product is left unchanged (NEEDS_IMAGES) rather than getting an unverified or fallback image.`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Media resolver failed" }, { status: 500 });
  }
}
