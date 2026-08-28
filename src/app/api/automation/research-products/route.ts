import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_QUERIES = [
  "best selling home gadgets India",
  "trending beauty products India",
  "useful kitchen products India",
];

function auth(req: Request) {
  const expected = process.env.AUTOMATION_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

function priceOf(item: any) {
  const n = Number(item?.extracted_price);
  if (Number.isFinite(n) && n > 0) return n;
  const m = String(item?.price || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function imageOf(item: any) {
  return item?.thumbnail || item?.serpapi_thumbnail || item?.image || "";
}

async function verifyImage(title: string, imageUrl: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !imageUrl) return false;
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: "You are an ecommerce product-image verifier. Reply exactly MATCH if the image visibly represents the requested product; otherwise reply REJECT.",
      input: [{ role: "user", content: [
        { type: "input_text", text: `Requested product: ${title}` },
        { type: "input_image", image_url: imageUrl },
      ] }],
    }),
  });
  if (!r.ok) return false;
  const data = await r.json();
  return /^MATCH\b/i.test(String(data.output_text || "").trim());
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const key = process.env.SERPAPI_API_KEY;
    if (!key) return NextResponse.json({ error: "SERPAPI_API_KEY is not configured" }, { status: 503 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

    const queries = Array.isArray(body.queries) && body.queries.length ? body.queries : DEFAULT_QUERIES;
    const userId = Number(body.userId || 1);
    const maxProducts = Math.min(10, Math.max(1, Number(body.limit || 6)));
    const created: any[] = [];

    for (const query of queries) {
      if (created.length >= maxProducts) break;
      const url = `https://serpapi.com/search.json?engine=google_shopping&google_domain=google.co.in&gl=in&hl=en&q=${encodeURIComponent(String(query))}&api_key=${encodeURIComponent(key)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      const results = Array.isArray(data.shopping_results) ? data.shopping_results : [];

      for (const item of results) {
        if (created.length >= maxProducts) break;
        const title = String(item.title || "").trim();
        const sourceName = String(item.source || item.merchant || "Web source").trim();
        const sourceUrl = String(item.product_link || item.link || "").trim();
        const sourcePrice = priceOf(item);
        const imageUrl = imageOf(item);
        if (!title || !sourcePrice || !/^https?:\/\//i.test(imageUrl)) continue;

        const [existing] = await db.select().from(products).where(ilike(products.title, title)).limit(1);
        if (existing) continue;

        const matched = await verifyImage(title, imageUrl);
        if (!matched) continue;

        const sellingPrice = Math.max(Math.round(sourcePrice * 1.35), Math.round(sourcePrice + 100));
        const shipping = 0;
        const profit = sellingPrice - sourcePrice - shipping;
        const margin = profit / sellingPrice * 100;
        if (profit <= 0 || margin < 25) continue;

        const sku = `BS-AI-${Date.now()}-${created.length + 1}`;
        const [product] = await db.insert(products).values({
          userId,
          sku,
          title,
          category: String(item.category || "Trending Products"),
          imageUrl,
          brand: String(item.brand || sourceName || "Web Source"),
          supplierName: sourceName,
          supplierCity: "India",
          supplierCostInr: sourcePrice.toFixed(2),
          shippingCostInr: shipping.toFixed(2),
          gstPct: "0.00",
          sellingPriceInr: sellingPrice.toFixed(2),
          mrpInr: Math.round(sellingPrice * 1.15).toFixed(2),
          customMarginPct: margin.toFixed(2),
          netProfitInr: profit.toFixed(2),
          aiScore: 90,
          viralVelocityScore: 85,
          stockCount: 100,
          moq: 1,
          status: "Published",
          aiMarketingCopy: `${title} — verified product sourced from ${sourceName}. Buy now with BharatShop delivery.` ,
          aiTargetAudience: "Indian online shoppers",
        }).returning();

        await db.insert(productImages).values({
          productId: product.id,
          imageUrl,
          sourceUrl,
          sortOrder: 0,
          altText: sourceName,
          verificationStatus: "WEB_SEARCH_MATCHED",
        });

        await db.insert(aiActivityLogs).values({
          userId,
          agentName: "AI-Product-Research-Agent",
          actionType: "PRODUCT_RESEARCH_VERIFIED_PUBLISHED",
          message: `Researched, image-verified and published ${title} from ${sourceName}.`,
          profitImpactInr: profit.toFixed(2),
          status: "SUCCESS",
          metadataJson: { productId: product.id, query, sourceName, sourceUrl, sourcePrice, sellingPrice, marginPct: margin },
        });
        created.push({ id: product.id, title, sourceName, sourcePrice, sellingPrice, marginPct: Number(margin.toFixed(2)) });
      }
    }

    return NextResponse.json({ status: "COMPLETED", researched: created.length, products: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product research failed" }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ agent: "AI-Product-Research-Agent", status: process.env.SERPAPI_API_KEY && process.env.OPENAI_API_KEY ? "ready" : "blocked_missing_keys" });
}
