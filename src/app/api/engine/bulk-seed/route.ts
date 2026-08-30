import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, users, productRefreshLogs, aiActivityLogs } from "@/db/schema";
import { generateAllProducts, generateMarketingCopy } from "@/lib/productEngine";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

export async function POST() {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;

    // Check current count
    const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(products);
    const currentCount = countResult[0]?.count ?? 0;

    if (currentCount >= 800) {
      return NextResponse.json({
        message: `Already ${currentCount} products in catalog. Run /api/engine/daily-refresh to update scores.`,
        currentCount,
        skipped: true,
      });
    }

    const allProducts = generateAllProducts();
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let totalProjectedProfit = 0;
    const categoryCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};

    // Insert in batches to avoid timeout
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE);
      const rows = batch.map(p => {
        const cost = Number(p.supplierCostInr);
        const ship = Number(p.shippingCostInr);
        const gst = Number(p.gstPct);
        const price = Number(p.sellingPriceInr);
        const netProfit = price - cost - ship - (cost * gst / 100);
        const marginPct = price > 0 ? (netProfit / price) * 100 : 0;

        totalProjectedProfit += netProfit;
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;

        const aiCopy = generateMarketingCopy({
          title: p.title,
          netProfitInr: netProfit,
          category: p.category,
        });

        return {
          userId,
          sku: p.sku + `-${Date.now().toString(36).slice(-4)}`,
          title: p.title,
          category: p.category,
          imageUrl: p.imageUrl,
          brand: p.brand,
          supplierName: p.supplierName,
          supplierCity: p.supplierCity,
          supplierCostInr: cost.toFixed(2),
          shippingCostInr: ship.toFixed(2),
          gstPct: gst.toFixed(2),
          sellingPriceInr: price.toFixed(2),
          mrpInr: Number(p.mrpInr).toFixed(2),
          customMarginPct: marginPct.toFixed(2),
          netProfitInr: netProfit.toFixed(2),
          aiScore: p.baseAiScore,
          viralVelocityScore: p.baseViralScore,
          stockCount: p.stockCount,
          moq: p.moq,
          autoRepriceEnabled: true,
          status: "Published",
          aiMarketingCopy: aiCopy,
          aiTargetAudience: p.aiTargetAudience,
          hsnCode: p.hsnCode,
          salesCount24h: Math.floor(Math.random() * 80),
        };
      });

      await db.insert(products).values(rows);
      insertedCount += rows.length;
    }

    // Log the refresh run
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Electronics & Gadgets";
    const topBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "boAt";
    const avgScore = Math.round(allProducts.reduce((a, p) => a + p.baseAiScore, 0) / allProducts.length);

    await db.insert(productRefreshLogs).values({
      userId,
      totalProductsUpdated: 0,
      totalProductsAdded: insertedCount,
      totalProductsDropped: 0,
      avgAiScore: avgScore.toFixed(2),
      topCategory,
      topBrand,
      totalProjectedProfitInr: totalProjectedProfit.toFixed(2),
      agentSummary: `Bulk seeded ${insertedCount} products across ${Object.keys(categoryCounts).length} categories. Top category: ${topCategory}. Top brand: ${topBrand}. Avg AI Score: ${avgScore}/100.`,
      status: "COMPLETED",
    });

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "BulkSeed-Engine // Product Matrix",
      actionType: "BULK_SEED",
      message: `${insertedCount} trending Indian dropshipping products catalog mein add kiye. ${Object.keys(categoryCounts).length} categories, ${Object.keys(brandCounts).length} brands. Projected daily profit: ₹${Math.round(totalProjectedProfit).toLocaleString("en-IN")}`,
      profitImpactInr: totalProjectedProfit.toFixed(2),
      status: "SUCCESS",
    });

    return NextResponse.json({
      success: true,
      insertedCount,
      totalInCatalog: currentCount + insertedCount,
      categoriesCount: Object.keys(categoryCounts).length,
      brandsCount: Object.keys(brandCounts).length,
      avgAiScore: avgScore,
      topCategory,
      topBrand,
      totalProjectedProfitInr: Math.round(totalProjectedProfit),
      message: `${insertedCount} products successfully seeded into BharatDrop catalog!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Bulk seed error";
    console.error("Bulk seed error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
