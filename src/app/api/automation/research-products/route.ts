import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { serpSearch } from "@/lib/ai/agent-tools";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_QUERIES = [
  "best selling home gadgets India price",
  "trending beauty products India price",
  "useful kitchen products India price",
  "popular fashion products India price",
];

function auth(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

function priceOf(item: any) {
  const n = Number(item?.extracted_price);
  if (Number.isFinite(n) && n > 0) return n;
  const m = String(item?.price || item?.snippet || "").replace(/,/g, "").match(/(?:₹|INR|Rs\.?\s*)(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : 0;
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const queries = Array.isArray(body.queries) && body.queries.length ? body.queries : DEFAULT_QUERIES;
    const userId = Number(body.userId || 1);
    const maxProducts = Math.min(10, Math.max(1, Number(body.limit || 6)));
    const created: any[] = [];

    for (const query of queries) {
      if (created.length >= maxProducts) break;
      const data = await serpSearch(String(query), "google_shopping");
      for (const item of Array.isArray(data.shopping_results) ? data.shopping_results : []) {
        if (created.length >= maxProducts) break;
        const title = String(item.title || "").trim();
        const sourceUrl = String(item.link || "").trim();
        const sourceName = String(item.source || item.merchant || "Web source").trim();
        const sourcePrice = priceOf(item);
        if (!title || sourcePrice <= 0 || !/^https?:\/\//i.test(sourceUrl)) continue;
        const [existing] = await db.select().from(products).where(ilike(products.title, title)).limit(1);
        if (existing) continue;

        const sellingPrice = Math.max(Math.round(sourcePrice * 1.35), Math.round(sourcePrice + 100));
        const mrp = Math.max(Math.round(sellingPrice * 1.15), sellingPrice);
        const profit = sellingPrice - sourcePrice;
        const margin = sellingPrice ? profit / sellingPrice * 100 : 0;
        if (profit <= 0 || margin < 25) continue;

        const sku = `BS-RESEARCH-${Date.now()}-${created.length + 1}`;
        const [product] = await db.insert(products).values({
          userId,
          sku,
          title,
          category: "Discovered Products",
          imageUrl: "",
          brand: "Generic",
          supplierName: sourceName,
          supplierCity: "India",
          supplierCostInr: sourcePrice.toFixed(2),
          shippingCostInr: "0.00",
          gstPct: "0.00",
          sellingPriceInr: sellingPrice.toFixed(2),
          mrpInr: mrp.toFixed(2),
          customMarginPct: margin.toFixed(2),
          netProfitInr: profit.toFixed(2),
          aiScore: 0,
          viralVelocityScore: 0,
          stockCount: 1,
          moq: 1,
          status: "STAGED",
          aiMarketingCopy: `Live-source candidate discovered from ${sourceName}; media verification pending.`,
          aiTargetAudience: "Indian online shoppers",
        }).returning();

        await db.insert(aiActivityLogs).values({
          userId,
          agentName: "AI-Product-Research-Agent",
          actionType: "PRODUCT_RESEARCH_DISCOVERED",
          message: `Discovered live product candidate "${title}" from ${sourceName}; staged pending media verification.`,
          profitImpactInr: profit.toFixed(2),
          status: "SUCCESS",
          metadataJson: { productId: product.id, query, sourceName, sourceUrl, sourcePrice, sellingPrice, marginPct: margin },
        });

        const media = await resolveVerifiedProductMedia(product.id);
        created.push({ id: product.id, title, sourceName, sourcePrice, sellingPrice, marginPct: Number(margin.toFixed(2)), mediaStatus: media.status, publicationGate: media.publicationGate });
      }
    }

    return NextResponse.json({ status: "COMPLETED", researched: created.length, products: created, provider: "SearXNG->PostgreSQL->Claude Vision", publicationPolicy: "Only products with 4-8 persisted AI_VISION_VERIFIED HTTPS images may be published." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product research failed" }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ agent: "AI-Product-Research-Agent", status: process.env.SEARXNG_URL && process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY ? "ready" : "blocked_missing_provider" });
}
