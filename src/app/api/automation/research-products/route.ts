import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { serpSearch } from "@/lib/ai/agent-tools";
import { UNIVERSAL_CATALOGUE_QUERIES } from "@/lib/suppliers/universal-catalogue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_QUERIES = UNIVERSAL_CATALOGUE_QUERIES;

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
    const maxProducts = Math.min(50, Math.max(1, Number(body.limit || 20)));
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

        // Discovery evidence is not fulfilment or stock proof. Keep the candidate
        // staged and let the dedicated source/media workers verify it later. This
        // avoids hammering the free SearXNG instance with web + image searches in
        // one tight loop and preserves the publication gate.
        const sellingPrice = Math.ceil((sourcePrice * 1.35) / 10) * 10;
        const mrp = Math.max(Math.ceil((sellingPrice * 1.15) / 10) * 10, sellingPrice);
        const profit = sellingPrice - sourcePrice;
        const margin = sellingPrice ? profit / sellingPrice * 100 : 0;
        if (profit <= 0 || margin < 25) continue;

        const sku = `BS-RESEARCH-${Date.now()}-${created.length + 1}`;
        const [product] = await db.insert(products).values({
          userId, sku, title, category: "Discovered Products", imageUrl: "", brand: "Generic",
          supplierName: sourceName, supplierCity: "India", supplierCostInr: sourcePrice.toFixed(2),
          shippingCostInr: "0.00", gstPct: "0.00", sellingPriceInr: sellingPrice.toFixed(2),
          mrpInr: mrp.toFixed(2), customMarginPct: margin.toFixed(2), netProfitInr: profit.toFixed(2),
          aiScore: 0, viralVelocityScore: 0, stockCount: 0, moq: 1, status: "STAGED",
          aiMarketingCopy: `Discovery candidate from ${sourceName}; live source, stock, serviceability, payment and media verification pending.`,
          aiTargetAudience: "Indian online shoppers",
        }).returning();

        await db.insert(aiActivityLogs).values({
          userId, agentName: "AI-Product-Research-Agent", actionType: "PRODUCT_RESEARCH_DISCOVERED",
          message: `Discovered catalogue candidate "${title}" from ${sourceName}; staged pending source and media verification.`,
          profitImpactInr: profit.toFixed(2), status: "SUCCESS",
          metadataJson: { productId: product.id, query, sourceName, sourceUrl, discoveryPrice: sourcePrice, estimatedSellingPrice: sellingPrice, marginPct: margin, stockVerified: false, fulfilmentAuthorized: false, mediaVerified: false },
        });

        created.push({
          id: product.id,
          title,
          sourceName,
          sourceUrl,
          discoveryPrice: sourcePrice,
          sellingPrice,
          marginPct: Number(margin.toFixed(2)),
          mediaStatus: "PENDING_MEDIA_VERIFICATION",
          publicationGate: "BLOCK",
        });
      }
    }

    return NextResponse.json({
      status: "COMPLETED",
      researched: created.length,
      products: created,
      queriesScanned: queries.length,
      provider: "SearXNG->PostgreSQL",
      nextStage: "dedicated Gemma media verification worker",
      publicationPolicy: "Discovery never implies fulfilment. Publish only after live source qualification and 4-8 persisted AI_VISION_VERIFIED HTTPS images.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product research failed" }, { status: 503 });
  }
}

export async function GET() {
  const localAI = Boolean(process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL);
  const searxng = Boolean(process.env.SEARXNG_URL);
  return NextResponse.json({
    agent: "AI-Product-Research-and-Catalogue-Agent",
    status: localAI && searxng ? "ready" : "blocked_missing_provider",
    providers: { localGemma: localAI, searxng },
    queryCount: DEFAULT_QUERIES.length,
  });
}
