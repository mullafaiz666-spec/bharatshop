import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { asc, eq, isNull, or } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 10;
const BAD_IMAGE_HOSTS = ["unsplash.com", "images.unsplash.com", "source.unsplash.com", "placeholder.com", "placehold.co", "placehold.it", "dummyimage.com", "picsum.photos", "loremflickr.com", "placekitten.com"];

function placeholder(url: unknown) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return true;
  const u = url.toLowerCase();
  return BAD_IMAGE_HOSTS.some(h => u.includes(h));
}

async function searchImages(title: string, brand: string) {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY is not configured");
  const q = `${brand || ""} ${title}`.trim();
  const r = await fetch(`https://serpapi.com/search.json?engine=google_images&google_domain=google.co.in&gl=in&hl=en&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`SerpAPI returned ${r.status}`);
  const d = await r.json();
  return (d.images_results || []).filter((x: any) => !placeholder(x?.original) && !placeholder(x?.link)).slice(0, 6);
}

async function verifyImage(product: any, candidate: any) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: "You are an ecommerce image verification agent. Return MATCH only if the supplied image visibly represents the requested product. Otherwise return REJECT. Do not assume an exact model from text alone.",
      input: [{ role: "user", content: [
        { type: "input_text", text: `Requested product: ${product.brand} ${product.title}\nSearch result title: ${candidate.title || ""}\nSource: ${candidate.source || ""}` },
        { type: "input_image", image_url: candidate.original },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI returned ${r.status}`);
  const d = await r.json();
  return String(d.output_text || "").trim();
}

async function runMaintenance(userId: number, limit = BATCH_SIZE) {
  if (!process.env.SERPAPI_API_KEY || !process.env.OPENAI_API_KEY) throw new Error("Live image maintenance requires SERPAPI_API_KEY and OPENAI_API_KEY");
  const all = await db.select().from(products).orderBy(asc(products.id));
  const imageRows = await db.select().from(productImages);
  const verifiedIds = new Set(imageRows.filter(i => i.verificationStatus === "VERIFIED" || i.verificationStatus === "WEB_SEARCH_MATCHED").map(i => i.productId));
  const candidates = all.filter(p => placeholder(p.imageUrl) || !verifiedIds.has(p.id)).slice(0, limit);
  const results: any[] = [];

  for (const product of candidates) {
    try {
      const images = await searchImages(product.title, product.brand);
      let match: any = null;
      let reason = "No candidate passed verification.";
      for (const image of images) {
        const verdict = await verifyImage(product, image);
        reason = verdict;
        if (/^MATCH\b/i.test(verdict)) { match = image; break; }
      }
      if (!match) {
        results.push({ productId: product.id, status: "BLOCKED", candidates: images.length, reason });
        await db.insert(aiActivityLogs).values({ userId: product.userId, agentName: "Image-Verification-Agent", actionType: "PRODUCT_IMAGE_VERIFICATION_BLOCKED", message: `No verified real image found for ${product.title}; storefront image remains blocked.`, profitImpactInr: "0.00", status: "WARNING", metadataJson: { productId: product.id, candidates: images.length, reason } });
        continue;
      }
      await db.update(productImages).set({ verificationStatus: "REJECTED_PLACEHOLDER_OR_STALE" }).where(eq(productImages.productId, product.id));
      await db.insert(productImages).values({ productId: product.id, imageUrl: match.original, sourceUrl: match.link, sortOrder: 0, altText: String(match.source || "Verified web source"), verificationStatus: "WEB_SEARCH_MATCHED" });
      await db.update(products).set({ imageUrl: match.original, updatedAt: new Date() }).where(eq(products.id, product.id));
      await db.insert(aiActivityLogs).values({ userId: product.userId, agentName: "Image-Verification-Agent", actionType: "PRODUCT_IMAGE_VERIFIED", message: `Automated real-image verification passed for ${product.title}.`, profitImpactInr: "0.00", status: "SUCCESS", metadataJson: { productId: product.id, imageUrl: match.original, sourceUrl: match.link, sourceName: match.source, verification: reason } });
      results.push({ productId: product.id, status: "VERIFIED", imageUrl: match.original, sourceUrl: match.link });
    } catch (e) {
      results.push({ productId: product.id, status: "ERROR", reason: e instanceof Error ? e.message : "Unknown error" });
    }
  }
  return { processed: results.length, verified: results.filter(r => r.status === "VERIFIED").length, blocked: results.filter(r => r.status === "BLOCKED").length, errors: results.filter(r => r.status === "ERROR").length, results, remainingUnverified: Math.max(0, all.filter(p => placeholder(p.imageUrl) || !verifiedIds.has(p.id)).length - results.length) };
}

export async function GET() {
  return NextResponse.json({ agent: "Image-Verification-Agent", automation: "catalog-maintenance", status: process.env.SERPAPI_API_KEY && process.env.OPENAI_API_KEY ? "ready" : "blocked_missing_keys", batchSize: BATCH_SIZE, trigger: "agent-pipeline" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runMaintenance(Number(body.userId || 1), Math.min(BATCH_SIZE, Math.max(1, Number(body.limit || BATCH_SIZE))));
    return NextResponse.json({ status: "COMPLETED", ...result });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Catalog maintenance failed" }, { status: 503 }); }
}