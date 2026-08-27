import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productRefreshLogs, aiActivityLogs, marketingCampaigns } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { desc, eq, sql } from "drizzle-orm";
import { generateMarketingCopy, generateCampaign } from "@/lib/productEngine";

export const maxDuration = 60;

export async function POST() {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;

    const allProducts = await db.select().from(products).orderBy(desc(products.aiScore));

    if (allProducts.length === 0) {
      return NextResponse.json({ error: "No products found. Run bulk-seed first." }, { status: 400 });
    }

    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);

    let updatedCount = 0;
    let totalProjectedProfit = 0;
    const categoryCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    const BATCH_SIZE = 50;

    // Update products in batches with daily price/score recalculation
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE);

      for (const product of batch) {
        const idx = i + batch.indexOf(product);
        const dayHash = ((dayOfYear * 13 + idx * 7 + product.id * 3) % 100);

        // Daily price fluctuation ±4%
        const priceFlux = 1 + ((dayHash % 9) - 4) / 100;
        const costFlux = 1 + ((dayHash % 7) - 3) / 100;

        // AI score drift (trending up or cooling down)
        const scoreDrift = Math.floor(((dayHash % 11) - 5) * 0.6);
        const newAiScore = Math.max(65, Math.min(100, product.aiScore + scoreDrift));
        const newViral = Math.max(55, Math.min(100, product.viralVelocityScore + Math.floor(scoreDrift * 0.7)));

        const newCost = Math.max(50, Math.round(Number(product.supplierCostInr) * costFlux));
        const newPrice = Math.max(newCost + 80, Math.round(Number(product.sellingPriceInr) * priceFlux));
        const gstAmt = newCost * Number(product.gstPct) / 100;
        const newShip = Number(product.shippingCostInr);
        const netProfit = newPrice - newCost - newShip - gstAmt;
        const marginPct = netProfit / newPrice * 100;

        // Refresh stock simulation
        const soldToday = Math.floor(Math.random() * 40);
        const restocked = Math.floor(Math.random() * 60);
        const newStock = Math.max(10, Number(product.stockCount) - soldToday + restocked);
        const newSales24h = soldToday + Math.floor(Math.random() * 30);

        // Regenerate AI marketing copy periodically
        const newCopy = dayOfYear % 3 === 0 || idx % 50 === 0
          ? generateMarketingCopy({ title: product.title, netProfitInr: netProfit, category: product.category })
          : product.aiMarketingCopy;

        await db.update(products).set({
          supplierCostInr: newCost.toFixed(2),
          sellingPriceInr: newPrice.toFixed(2),
          netProfitInr: netProfit.toFixed(2),
          customMarginPct: marginPct.toFixed(2),
          aiScore: newAiScore,
          viralVelocityScore: newViral,
          stockCount: newStock,
          salesCount24h: newSales24h,
          aiMarketingCopy: newCopy,
          updatedAt: new Date(),
        }).where(eq(products.id, product.id));

        totalProjectedProfit += netProfit;
        categoryCounts[product.category] = (categoryCounts[product.category] || 0) + 1;
        if (product.brand) brandCounts[product.brand] = (brandCounts[product.brand] || 0) + 1;
        updatedCount++;
      }
    }

    // Auto-generate marketing campaigns for top 20 products
    const top20 = allProducts
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 20);

    let campaignsGenerated = 0;
    for (const p of top20) {
      const netProfit = Number(p.netProfitInr);
      const campaign = generateCampaign({
        title: p.title,
        netProfitInr: netProfit,
        category: p.category,
        aiTargetAudience: p.aiTargetAudience,
        sellingPriceInr: Number(p.sellingPriceInr),
      });

      await db.insert(marketingCampaigns).values({
        userId,
        productId: p.id,
        productTitle: p.title,
        platform: campaign.platform,
        campaignType: campaign.campaignType,
        headline: campaign.headline,
        bodyText: campaign.bodyText,
        ctaText: campaign.ctaText,
        targetAudience: campaign.targetAudience,
        budgetInr: campaign.budgetInr.toFixed(2),
        estimatedReachK: campaign.estimatedReachK,
        estimatedRoas: campaign.estimatedRoas.toFixed(2),
        status: "LIVE",
        impressions: Math.floor(Math.random() * 50000),
        clicks: Math.floor(Math.random() * 2000),
        conversions: Math.floor(Math.random() * 80),
        revenueGeneratedInr: (Math.random() * 50000).toFixed(2),
        scheduledAt: new Date(),
      });
      campaignsGenerated++;
    }

    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Electronics & Gadgets";
    const topBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "boAt";
    const avgScore = Math.round(allProducts.reduce((a, p) => a + p.aiScore, 0) / allProducts.length);

    // Log the refresh
    await db.insert(productRefreshLogs).values({
      userId,
      totalProductsUpdated: updatedCount,
      totalProductsAdded: 0,
      totalProjectedProfitInr: totalProjectedProfit.toFixed(2),
      avgAiScore: avgScore.toFixed(2),
      topCategory,
      topBrand,
      agentSummary: `Daily AI refresh complete: ${updatedCount} products recalculated with fresh prices, AI scores, viral velocity, and stock counts. ${campaignsGenerated} marketing campaigns auto-generated. Avg AI Score: ${avgScore}/100.`,
      status: "COMPLETED",
    });

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "DailyRefresh-Engine // Market Oracle",
      actionType: "DAILY_REFRESH",
      message: `✅ Daily AI recalculation complete — ${updatedCount} products refreshed | ${campaignsGenerated} campaigns generated | Avg Score: ${avgScore}/100 | Top: ${topCategory}`,
      profitImpactInr: totalProjectedProfit.toFixed(2),
      status: "SUCCESS",
    });

    return NextResponse.json({
      success: true,
      updatedCount,
      campaignsGenerated,
      avgAiScore: avgScore,
      topCategory,
      topBrand,
      totalProjectedProfitInr: Math.round(totalProjectedProfit),
      refreshedAt: new Date().toISOString(),
      message: `Daily refresh complete: ${updatedCount} products updated, ${campaignsGenerated} campaigns launched!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Daily refresh error";
    console.error("Daily refresh error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  await ensureDemoDataSeeded();
  const logs = await db
    .select()
    .from(productRefreshLogs)
    .orderBy(desc(productRefreshLogs.runAt))
    .limit(10);
  return NextResponse.json({ refreshLogs: logs });
}
