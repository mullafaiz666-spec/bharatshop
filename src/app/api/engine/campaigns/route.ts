import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketingCampaigns, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { generateCampaign } from "@/lib/productEngine";

export const dynamic = "force-dynamic";

function channelConnected(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("google")) return Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN);
  if (p.includes("facebook") || p.includes("instagram")) return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
  if (p.includes("whatsapp")) return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  return false;
}

export async function GET(req: Request) {
  await ensureDemoDataSeeded();
  const { searchParams } = new URL(req.url); const limit = parseInt(searchParams.get("limit") || "50"); const platform = searchParams.get("platform");
  const all = await db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)).limit(limit);
  const filtered = platform && platform !== "ALL" ? all.filter(c => c.platform === platform) : all;
  return NextResponse.json({ campaigns: filtered, total: filtered.length, connected: filtered.filter(c => channelConnected(c.platform)).map(c => c.platform) });
}

export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded(); const userId = demoUser?.id ?? 1; const body = await req.json();
    const { productId, platform, campaignType, budgetInr, customHeadline, customBody } = body;
    let targetProduct;
    if (productId) targetProduct = (await db.select().from(products).where(eq(products.id, Number(productId))))[0];
    else targetProduct = (await db.select().from(products).orderBy(desc(products.aiScore)).limit(20))[0];
    if (!targetProduct) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const campaign = generateCampaign({ title: targetProduct.title, netProfitInr: targetProduct.netProfitInr, category: targetProduct.category, aiTargetAudience: targetProduct.aiTargetAudience, sellingPriceInr: targetProduct.sellingPriceInr });
    const selectedPlatform = platform || campaign.platform; const connected = channelConnected(selectedPlatform);
    const status = connected ? "SCHEDULED" : "DRAFT";
    const [created] = await db.insert(marketingCampaigns).values({ userId, productId: targetProduct.id, productTitle: targetProduct.title, platform: selectedPlatform, campaignType: campaignType || campaign.campaignType, headline: customHeadline || campaign.headline, bodyText: customBody || campaign.bodyText, ctaText: campaign.ctaText, targetAudience: campaign.targetAudience, budgetInr: (budgetInr || campaign.budgetInr).toString(), estimatedReachK: campaign.estimatedReachK, estimatedRoas: campaign.estimatedRoas.toFixed(2), status, impressions: 0, clicks: 0, conversions: 0, revenueGeneratedInr: "0.00", scheduledAt: connected ? new Date() : null }).returning();
    await db.insert(aiActivityLogs).values({ userId, agentName: "Advertising-Agent", actionType: connected ? "CAMPAIGN_SCHEDULED" : "CAMPAIGN_DRAFTED", message: `${connected ? "Campaign scheduled" : "Campaign prepared as draft; no connected ad account"}: ${created.headline.slice(0, 60)} on ${created.platform}.`, profitImpactInr: "0", status: connected ? "SUCCESS" : "BLOCKED", metadataJson: { connected, platform: selectedPlatform } });
    return NextResponse.json({ campaign: created, channelConnected: connected, live: false, message: connected ? "Campaign prepared for the connected channel; execution is scheduled, not falsely marked LIVE." : "Campaign prepared as DRAFT because no real ad account is connected." }, { status: 201 });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json(); const { id, status } = body; if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    const existing = (await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, Number(id))))[0]; if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (status === "LIVE" && !channelConnected(existing.platform)) return NextResponse.json({ error: `Cannot mark ${existing.platform} LIVE: real advertising account is not connected.` }, { status: 409 });
    const [updated] = await db.update(marketingCampaigns).set({ ...(status && { status }) }).where(eq(marketingCampaigns.id, Number(id))).returning();
    return NextResponse.json({ campaign: updated });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function DELETE(req: Request) { try { const id = new URL(req.url).searchParams.get("id"); if (!id) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 }); await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, Number(id))); return NextResponse.json({ deleted: true }); } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); } }
