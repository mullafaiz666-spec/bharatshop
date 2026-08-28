import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, marketingCampaigns, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const [p] = await db.select().from(products).where(eq(products.id, Number(body.productId))).limit(1);
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (p.stockCount <= 0 || Number(p.netProfitInr) <= 0) return NextResponse.json({ error: "Product failed listing/advertising eligibility" }, { status: 422 });

    const headline = body.headline || `${p.title} — Smart Price, Fast Delivery`;
    const bodyText = body.bodyText || p.aiMarketingCopy || `${p.title}. Verified supplier stock, competitive pricing and India delivery.`;
    const platforms = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ["Google Shopping", "Facebook Ads", "Instagram Reels"];
    const created = [];
    for (const platform of platforms) {
      const [campaign] = await db.insert(marketingCampaigns).values({
        userId: p.userId, productId: p.id, productTitle: p.title, platform: String(platform), campaignType: body.campaignType || "NEW_LAUNCH",
        headline, bodyText, ctaText: body.ctaText || "Abhi Kharido!", targetAudience: body.targetAudience || p.aiTargetAudience,
        budgetInr: String(body.budgetInr || 500), estimatedReachK: 0, estimatedRoas: "0", status: "READY_FOR_CONNECTOR",
      }).returning();
      created.push(campaign);
    }
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Creative-Ads-Agent", actionType: "LISTING_CREATIVE_READY", message: `Created ${created.length} campaign payload(s) for ${p.title}; awaiting authorized ad connector publication.`, profitImpactInr: p.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ product: p, campaigns: created, status: "READY_FOR_AD_CONNECTOR" }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Marketing launch failed" }, { status: 500 }); }
}
