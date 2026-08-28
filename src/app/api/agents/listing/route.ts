import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { productId } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
    const [p] = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const images = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    const verifiedImage = images.find(i => (i.verificationStatus === "VERIFIED" || i.verificationStatus === "WEB_SEARCH_MATCHED") && /^https?:\/\//i.test(i.imageUrl));
    if (!verifiedImage) {
      return NextResponse.json({
        status: "BLOCKED",
        error: "Listing blocked: no source-backed verified product image exists.",
        nextAction: "Run /api/products/refresh-images with SERPAPI_API_KEY and OPENAI_API_KEY, then retry listing.",
      }, { status: 422 });
    }

    const selling = Number(p.sellingPriceInr), cost = Number(p.supplierCostInr) + Number(p.shippingCostInr);
    const profit = selling - cost, margin = selling ? profit / selling * 100 : 0;
    if (selling <= 0 || profit <= 0) {
      return NextResponse.json({
        status: "BLOCKED",
        error: "Listing blocked: product is not profitable at the current verified selling/source economics.",
      }, { status: 422 });
    }
    if (Number(p.stockCount) <= 0) {
      return NextResponse.json({
        status: "BLOCKED",
        error: "Listing blocked: verified source currently reports no available stock.",
      }, { status: 422 });
    }

    const listing = {
      title: p.title.replace(/\s+/g, " ").trim(),
      description: `${p.title} — source-backed product listing with verified image evidence and customer-friendly delivery.`,
      sellingPriceInr: selling,
      marginPct: +margin.toFixed(2),
      netProfitInr: +profit.toFixed(2),
      marketingCopy: p.aiMarketingCopy,
      targetAudience: p.aiTargetAudience,
      sourceEvidence: {
        imageUrl: verifiedImage.imageUrl,
        sourceUrl: verifiedImage.sourceUrl,
        sourceName: verifiedImage.altText,
        verificationStatus: verifiedImage.verificationStatus,
      },
      adCreativeData: { hook: p.aiMarketingCopy, audience: p.aiTargetAudience, imageUrl: verifiedImage.imageUrl, cta: "Abhi Kharido" },
    };

    // Publishing is the final gate of the listing agent. A product becomes
    // customer-visible only after verified imagery, positive economics and
    // available stock have all passed. This is what connects the AI
    // research/verification/marketing pipeline to the real storefront.
    await db.update(products).set({
      imageUrl: verifiedImage.imageUrl,
      netProfitInr: listing.netProfitInr.toFixed(2),
      customMarginPct: listing.marginPct.toFixed(2),
      aiMarketingCopy: listing.marketingCopy,
      status: "Published",
      updatedAt: new Date(),
    }).where(eq(products.id, p.id));

    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "LISTING_OPTIMIZED", message: `Optimized source-backed listing for ${p.title}: ${listing.marginPct}% margin.`, profitImpactInr: String(listing.netProfitInr), metadataJson: listing, status: "SUCCESS" });
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "CREATIVE_GENERATED", message: `Generated listing creative using verified image evidence for ${p.title}.`, profitImpactInr: String(listing.netProfitInr), metadataJson: listing.adCreativeData, status: "SUCCESS" });
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "STOREFRONT_PUBLISHED", message: `Published verified product to the BharatShop storefront: ${p.title}.`, profitImpactInr: String(listing.netProfitInr), metadataJson: { productId: p.id, status: "Published", imageUrl: verifiedImage.imageUrl, stockCount: p.stockCount, marginPct: listing.marginPct }, status: "SUCCESS" });

    return NextResponse.json({ listing, storefront: { published: true, productId: p.id, status: "Published" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 });
  }
}