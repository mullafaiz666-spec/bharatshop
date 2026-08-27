import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketingCampaigns, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { generateCampaign } from "@/lib/productEngine";

export async function GET(req: Request) {
  await ensureDemoDataSeeded();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const platform = searchParams.get("platform");

  const all = await db
    .select()
    .from(marketingCampaigns)
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(limit);

  const filtered = platform && platform !== "ALL"
    ? all.filter(c => c.platform === platform)
    : all;

  return NextResponse.json({ campaigns: filtered, total: filtered.length });
}

export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json();
    const { productId, platform, campaignType, budgetInr, customHeadline, customBody } = body;

    let targetProduct;
    if (productId) {
      const found = await db.select().from(products).where(eq(products.id, Number(productId)));
      targetProduct = found[0];
    } else {
      const allP = await db.select().from(products).orderBy(desc(products.aiScore)).limit(20);
      targetProduct = allP[Math.floor(Math.random() * allP.length)];
    }

    if (!targetProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const campaign = generateCampaign({
      title: targetProduct.title,
      netProfitInr: targetProduct.netProfitInr,
      category: targetProduct.category,
      aiTargetAudience: targetProduct.aiTargetAudience,
      sellingPriceInr: targetProduct.sellingPriceInr,
    });

    const [created] = await db.insert(marketingCampaigns).values({
      userId,
      productId: targetProduct.id,
      productTitle: targetProduct.title,
      platform: platform || campaign.platform,
      campaignType: campaignType || campaign.campaignType,
      headline: customHeadline || campaign.headline,
      bodyText: customBody || campaign.bodyText,
      ctaText: campaign.ctaText,
      targetAudience: campaign.targetAudience,
      budgetInr: (budgetInr || campaign.budgetInr).toString(),
      estimatedReachK: campaign.estimatedReachK,
      estimatedRoas: campaign.estimatedRoas.toFixed(2),
      status: "LIVE",
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenueGeneratedInr: "0.00",
      scheduledAt: new Date(),
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "AdCopy-GenAI // Campaign Engine",
      actionType: "CAMPAIGN_LAUNCHED",
      message: `Campaign launched: "${created.headline.slice(0, 60)}" on ${created.platform} | Budget: ₹${created.budgetInr} | Est. ROAS: ${created.estimatedRoas}x`,
      profitImpactInr: created.revenueGeneratedInr,
      status: "SUCCESS",
    });

    return NextResponse.json({ campaign: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, impressions, clicks, conversions } = body;
    if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

    const existing = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, Number(id)));
    const camp = existing[0];
    if (!camp) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newImpressions = impressions ?? (Number(camp.impressions) + Math.floor(Math.random() * 5000));
    const newClicks = clicks ?? (Number(camp.clicks) + Math.floor(Math.random() * 200));
    const newConversions = conversions ?? (Number(camp.conversions) + Math.floor(Math.random() * 20));
    const newRevenue = (newConversions * 800 + Math.random() * 2000).toFixed(2);

    const [updated] = await db.update(marketingCampaigns).set({
      ...(status && { status }),
      impressions: newImpressions,
      clicks: newClicks,
      conversions: newConversions,
      revenueGeneratedInr: newRevenue,
    }).where(eq(marketingCampaigns.id, Number(id))).returning();

    return NextResponse.json({ campaign: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, Number(id)));
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
