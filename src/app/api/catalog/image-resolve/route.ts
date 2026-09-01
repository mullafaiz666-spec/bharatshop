import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, or } from "drizzle-orm";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";
const APPROVED = new Set(["AI_VISION_VERIFIED"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
let maintenanceInFlight: Promise<NextResponse> | null = null;

async function runMaintenance(limit: number) {
  const all = await db.select().from(products).where(or(eq(products.status, "Published"), eq(products.status, "STAGED"))).orderBy(asc(products.id));
  const imgs = await db.select().from(productImages);
  const counts = new Map<number, number>();
  for (const x of imgs) if (APPROVED.has(String(x.verificationStatus)) && !BAD.test(x.imageUrl) && /^https?:\/\//i.test(x.imageUrl)) counts.set(x.productId, (counts.get(x.productId) || 0) + 1);
  const candidates = all.filter((p) => (counts.get(p.id) || 0) < 4).slice(0, limit);
  const results = [];
  for (const p of candidates) results.push(await resolveVerifiedProductMedia(p.id));
  return NextResponse.json({ status: "COMPLETED", provider: "searxng+claude-vision", processed: candidates.length, resolved: results.filter((r: any) => r.status === "COMPLETE_MEDIA_RESOLVED").length, blocked: results.filter((r: any) => ["NEEDS_IMAGES", "VERIFICATION_FAILED", "SEARCH_ERROR"].includes(String(r.status))).length, results, policy: "Only products with 4-8 reachable AI_VISION_VERIFIED images may be Published. Staged products remain unpublished until the gate passes." });
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!process.env.BHARATSHOP_AUTOMATION_TOKEN || token !== process.env.BHARATSHOP_AUTOMATION_TOKEN) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(5, Number(body.limit || 2)));
    if (maintenanceInFlight) return NextResponse.json({ status: "IN_PROGRESS", message: "Catalog image resolution is already running; no overlapping SearXNG/Claude job was started." }, { status: 202 });
    maintenanceInFlight = runMaintenance(limit).finally(() => { maintenanceInFlight = null; });
    return await maintenanceInFlight;
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Media resolver failed" }, { status: 500 }); }
}
