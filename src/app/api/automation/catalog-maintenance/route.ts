import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages } from "@/db/schema";
import { asc, eq, or } from "drizzle-orm";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";
import { aiConfigured, aiModels } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const MIN_IMAGES = 4;
const MIN_CONFIDENCE = 0.75;

function qualifiesImage(x: typeof productImages.$inferSelect) {
  return String(x.verificationStatus) === "AI_VISION_VERIFIED"
    && !BAD.test(x.imageUrl)
    && /^https:\/\//i.test(x.imageUrl)
    && Number(x.verificationConfidence) >= MIN_CONFIDENCE
    && String(x.verificationProvider) === "local-ai"
    && String(x.verificationModel) === aiModels().vision
    && !!x.verifiedAt;
}

async function enforcePublicationGate() {
  const all = await db.select().from(products).orderBy(asc(products.id));
  const imgs = await db.select().from(productImages);
  const counts = new Map<number, number>();
  for (const x of imgs) if (qualifiesImage(x)) counts.set(x.productId, (counts.get(x.productId) || 0) + 1);
  const blocked = all.filter((p) => p.status === "Published" && (counts.get(p.id) || 0) < MIN_IMAGES);
  for (const p of blocked) await db.update(products).set({ status: "STAGED", updatedAt: new Date() }).where(eq(products.id, p.id));
  return {
    blocked: blocked.length,
    verifiedPublished: all.filter((p) => p.status === "Published" && (counts.get(p.id) || 0) >= MIN_IMAGES).length,
    verificationProvider: "local-ai",
    verificationModel: aiModels().vision,
  };
}

export async function GET() {
  const ready = !!process.env.SEARXNG_URL && aiConfigured();
  return NextResponse.json({
    agent: "Product-Research-and-Catalogue-Agent",
    automation: "catalog-maintenance",
    status: ready ? "ready" : "blocked_missing_runtime_config",
    provider: "postgres-staging->searxng->local-ai-vision",
    verificationModel: aiModels().vision,
    publicationPolicy: "STAGED until central Media Resolver proves >=4 AI_VISION_VERIFIED images with persisted local-AI evidence",
  });
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-automation-token");
    if (!process.env.BHARATSHOP_AUTOMATION_TOKEN || token !== process.env.BHARATSHOP_AUTOMATION_TOKEN) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(10, Number(body.limit || 2)));
    const gateBefore = await enforcePublicationGate();
    const all = await db.select({ id: products.id, status: products.status }).from(products).where(or(eq(products.status, "STAGED"), eq(products.status, "Published"))).orderBy(asc(products.id));
    const results = [];
    for (const p of all.slice(0, limit)) results.push(await resolveVerifiedProductMedia(p.id));
    const gateAfter = await enforcePublicationGate();
    return NextResponse.json({
      status: "COMPLETED",
      provider: "postgres-staging->searxng->local-ai-vision",
      mode: "maintenance",
      staged: 0,
      processed: results.length,
      resolved: results.filter((r: any) => r.status === "COMPLETE_MEDIA_RESOLVED").length,
      blocked: results.filter((r: any) => r.publicationGate === "BLOCK").length,
      gateBefore,
      gateAfter,
      results,
      policy: "This route cannot publish directly. A product becomes Published only inside the central Media Resolver after 4-8 reachable AI_VISION_VERIFIED images with persisted local-AI evidence.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Catalog maintenance failed", publicationGate: "BLOCK" }, { status: 503 });
  }
}
