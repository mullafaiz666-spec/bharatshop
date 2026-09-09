import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productDetails, aiActivityLogs } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { serpSearch } from "@/lib/ai/agent-tools";
import { UNIVERSAL_CATALOGUE_QUERIES } from "@/lib/suppliers/universal-catalogue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PRIORITY_QUERIES = [
  "Meesho women fashion India price",
  "Meesho men fashion India price",
  "Meesho kids fashion India price",
  "Meesho footwear bags jewellery India price",
  "best selling smartphones India price",
  "best selling tablets India price",
  "best selling laptops India price",
  "best selling desktop computers India price",
  "computer monitors components SSD keyboard mouse India price",
  "mobile accessories chargers power banks cases India price",
  "TV appliances home kitchen India price",
  "beauty personal care toys sports automotive India price",
] as const;

const DEFAULT_QUERIES = Array.from(new Set([...PRIORITY_QUERIES, ...UNIVERSAL_CATALOGUE_QUERIES]));

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

function inferCategory(query: string, title: string) {
  const text = `${query} ${title}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/(smartphone|mobile phone|\bmobile\b|tablet|iphone|android phone)/, "Mobiles & Tablets"],
    [/(laptop|desktop|computer|gaming pc|monitor|pc component|motherboard|processor|cpu|gpu|graphics card|ram\b|ssd|hard drive|keyboard|mouse|router|networking|printer)/, "Laptops & Computers"],
    [/(gaming console|playstation|xbox|gaming access|gamepad)/, "Gaming"],
    [/(smart tv|television|soundbar|speaker|home entertainment|projector)/, "TV & Home Entertainment"],
    [/(earbud|headphone|neckband|audio|microphone)/, "Audio & Headphones"],
    [/(camera|lens|tripod|gimbal)/, "Cameras & Photography"],
    [/(smartwatch|wearable|fitness band)/, "Wearables & Watches"],
    [/(refrigerator|washing machine|air conditioner|\bac\b|air cooler|fan|microwave|appliance)/, "Appliances"],
    [/(kitchen|cookware|bottle|storage container|mixer grinder|induction|air fryer)/, "Home & Kitchen"],
    [/(furniture|mattress|home decor|lighting|organizer|curtain|bedsheet)/, "Furniture & Home Decor"],
    [/(women fashion|men fashion|kids fashion|fashion|shirt|t-shirt|tshirt|dress|kurti|kurta|saree|sari|jeans|trouser|top|hoodie|jacket|clothing|apparel)/, "Fashion"],
    [/(footwear|shoe|sandal|slipper|sneaker)/, "Footwear"],
    [/(bag|luggage|backpack|wallet|handbag)/, "Bags & Luggage"],
    [/(jewellery|jewelry|necklace|earring|bracelet|ring|fashion accessor)/, "Jewellery & Accessories"],
    [/(beauty|makeup|skin care|skincare|cosmetic)/, "Beauty"],
    [/(personal care|grooming|trimmer|shaver|hair care|oral care)/, "Personal Care"],
    [/(baby product|diaper|feeding|stroller)/, "Baby Products"],
    [/(toy|game|puzzle|remote control car|doll)/, "Toys & Kids"],
    [/(book|stationery|notebook|pen|school suppl)/, "Books & Stationery"],
    [/(sports|fitness|gym|yoga|cricket|football|badminton)/, "Sports & Fitness"],
    [/(automotive|car access|bike access|helmet|vehicle)/, "Automotive"],
    [/(tool|hardware|drill|screwdriver|home improvement)/, "Tools & Hardware"],
    [/(office suppl|business suppl)/, "Office & Business"],
    [/(pet suppl|dog|cat product)/, "Pet Supplies"],
    [/(grocery|food|beverage|household essential|cleaning|laundry)/, "Grocery & Essentials"],
    [/(travel access|travel product)/, "Travel"],
    [/(garden|outdoor)/, "Garden & Outdoor"],
  ];
  for (const [pattern, category] of rules) if (pattern.test(text)) return category;
  return "Other Products";
}

export async function POST(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const queries = Array.isArray(body.queries) && body.queries.length ? body.queries : DEFAULT_QUERIES;
    const userId = Number(body.userId || 1);
    const maxProducts = Math.min(120, Math.max(1, Number(body.limit || 50)));
    const created: any[] = [];
    const searchErrors: Array<{ query: string; error: string }> = [];
    const categoryCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    let queriesAttempted = 0;
    let queriesSucceeded = 0;

    for (const query of queries) {
      if (created.length >= maxProducts) break;
      queriesAttempted += 1;

      let data: Awaited<ReturnType<typeof serpSearch>>;
      try {
        data = await serpSearch(String(query), "google_shopping");
        queriesSucceeded += 1;
      } catch (error) {
        searchErrors.push({
          query: String(query),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      for (const item of Array.isArray(data.shopping_results) ? data.shopping_results : []) {
        if (created.length >= maxProducts) break;
        const title = String(item.title || "").trim();
        const sourceUrl = String(item.link || "").trim();
        const sourceName = String(item.source || item.merchant || "Web source").trim();
        const sourcePrice = priceOf(item);
        if (!title || sourcePrice <= 0 || !/^https?:\/\//i.test(sourceUrl)) continue;
        const [existing] = await db.select().from(products).where(ilike(products.title, title)).limit(1);
        if (existing) continue;

        const category = inferCategory(String(query), title);
        const sellingPrice = Math.ceil((sourcePrice * 1.35) / 10) * 10;
        const mrp = Math.max(Math.ceil((sellingPrice * 1.15) / 10) * 10, sellingPrice);
        const profit = sellingPrice - sourcePrice;
        const margin = sellingPrice ? profit / sellingPrice * 100 : 0;
        if (profit <= 0 || margin < 25) continue;

        const sku = `BS-RESEARCH-${Date.now()}-${created.length + 1}`;
        const [product] = await db.insert(products).values({
          userId, sku, title, category, imageUrl: "", brand: "Generic",
          supplierName: sourceName, supplierCity: "India", supplierCostInr: sourcePrice.toFixed(2),
          shippingCostInr: "0.00", gstPct: "0.00", sellingPriceInr: sellingPrice.toFixed(2),
          mrpInr: mrp.toFixed(2), customMarginPct: margin.toFixed(2), netProfitInr: profit.toFixed(2),
          aiScore: 0, viralVelocityScore: 0, stockCount: 0, moq: 1, status: "STAGED",
          aiMarketingCopy: `Discovery candidate from ${sourceName}; live source, stock, serviceability, payment and media verification pending.`,
          aiTargetAudience: "Indian online shoppers",
        }).returning();

        await db.insert(productDetails).values({
          productId: product.id,
          sourceUrl,
          verificationStatus: "DISCOVERED",
          specificationsJson: {
            discovery: {
              query: String(query),
              sourceName,
              sourceUrl,
              discoveryPriceInr: sourcePrice,
              category,
              discoveredAt: new Date().toISOString(),
            },
          },
        });

        await db.insert(aiActivityLogs).values({
          userId, agentName: "AI-Product-Research-Agent", actionType: "PRODUCT_RESEARCH_DISCOVERED",
          message: `Discovered ${category} candidate "${title}" from ${sourceName}; staged pending source and media verification.`,
          profitImpactInr: profit.toFixed(2), status: "SUCCESS",
          metadataJson: { productId: product.id, query, category, sourceName, sourceUrl, discoveryPrice: sourcePrice, estimatedSellingPrice: sellingPrice, marginPct: margin, stockVerified: false, fulfilmentAuthorized: false, mediaVerified: false },
        });

        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
        created.push({
          id: product.id,
          title,
          category,
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

    if (searchErrors.length) {
      await db.insert(aiActivityLogs).values({
        userId,
        agentName: "AI-Product-Research-Agent",
        actionType: "PRODUCT_RESEARCH_DEGRADED",
        message: `Product discovery completed with ${searchErrors.length} rate-limited or unavailable search queries; downstream verification remains active.`,
        profitImpactInr: "0.00",
        status: "WARNING",
        metadataJson: { searchErrors, queriesAttempted, queriesSucceeded, created: created.length, categoryCounts, sourceCounts },
      });
    }

    const status = searchErrors.length
      ? (queriesSucceeded > 0 ? "COMPLETED_WITH_DEGRADED_SEARCH" : "DEGRADED_SEARCH")
      : "COMPLETED";

    return NextResponse.json({
      status,
      researched: created.length,
      products: created,
      categoryCounts,
      sourceCounts,
      queriesScanned: queriesAttempted,
      queriesSucceeded,
      searchErrors,
      provider: "SearXNG/Google-Shopping->PostgreSQL",
      nextStage: "source verification -> enrichment -> media verification -> CEO review",
      publicationPolicy: "Discovery never implies fulfilment. Publish only after live source qualification, evidence-backed enrichment, verified media and CEO approval.",
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
    priorityCoverage: ["Meesho fashion", "mobiles", "tablets", "laptops", "desktop computers", "computer components", "mobile accessories", "home", "beauty", "sports", "automotive"],
  });
}
