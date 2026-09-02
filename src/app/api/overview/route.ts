import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, stores, products, cartItems, orders, automationRules, aiActivityLogs, productRefreshLogs, marketingCampaigns } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { requireAdminUser } from "@/lib/admin-auth";
import { desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDemoDataSeeded();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "aiScore";
  const offset = (page - 1) * limit;

  const [allUsers, allStores, allOrders, allRules, allCart, recentLogs, refreshLogs, campaigns] = await Promise.all([
    db.select().from(users).limit(1),
    db.select().from(stores),
    db.select().from(orders).orderBy(desc(orders.orderedAt)),
    db.select().from(automationRules).orderBy(desc(automationRules.createdAt)),
    db.select().from(cartItems).orderBy(desc(cartItems.addedAt)),
    db.select().from(aiActivityLogs).orderBy(desc(aiActivityLogs.createdAt)).limit(25),
    db.select().from(productRefreshLogs).orderBy(desc(productRefreshLogs.runAt)).limit(5),
    db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)).limit(20),
  ]);

  const allProductsForKpis = await db.select({
    id: products.id,
    netProfitInr: products.netProfitInr,
    aiScore: products.aiScore,
    category: products.category,
    brand: products.brand,
    sellingPriceInr: products.sellingPriceInr,
    supplierCostInr: products.supplierCostInr,
    salesCount24h: products.salesCount24h,
  }).from(products);

  const allFullProducts = await db.select().from(products).orderBy(desc(products.aiScore));
  let pageProducts = allFullProducts;

  if (category && category !== "ALL") pageProducts = pageProducts.filter(p => p.category === category);
  if (search) {
    const q = search.toLowerCase();
    pageProducts = pageProducts.filter(p =>
      p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }

  if (sortBy === "profit") pageProducts.sort((a, b) => Number(b.netProfitInr) - Number(a.netProfitInr));
  else if (sortBy === "price") pageProducts.sort((a, b) => Number(b.sellingPriceInr) - Number(a.sellingPriceInr));
  else if (sortBy === "viral") pageProducts.sort((a, b) => b.viralVelocityScore - a.viralVelocityScore);
  else if (sortBy === "sales") pageProducts.sort((a, b) => b.salesCount24h - a.salesCount24h);
  else pageProducts.sort((a, b) => b.aiScore - a.aiScore);

  const totalFiltered = pageProducts.length;
  const paginatedProducts = pageProducts.slice(offset, offset + limit);
  const user = allUsers[0];

  const totalRevenue = allOrders.reduce((a, o) => a + Number(o.customerPaidInr || 0), 0);
  const totalCost = allOrders.reduce((a, o) => a + Number(o.supplierCostInr || 0), 0);
  const totalNetProfit = allOrders.reduce((a, o) => a + Number(o.netProfitInr || 0), 0);
  const avgMarginPct = totalRevenue > 0 ? Number(((totalNetProfit / totalRevenue) * 100).toFixed(1)) : 38.4;
  const autoFulfillRate = allOrders.length > 0
    ? Math.round((allOrders.filter(o => ["Auto-Ordered", "In Transit", "Delivered"].includes(o.fulfillmentStatus)).length / allOrders.length) * 100)
    : 96;

  const cartTotalCost = allCart.reduce((a, c) => a + Number(c.supplierCostInr) * c.quantity, 0);
  const cartProjectedRevenue = allCart.reduce((a, c) => a + Number(c.customSellingPriceInr) * c.quantity, 0);
  const cartProjectedProfit = allCart.reduce((a, c) => a + Number(c.netProfitInr) * c.quantity, 0);
  const catalogTotalProfit = allProductsForKpis.reduce((a, p) => a + Number(p.netProfitInr), 0);
  const catalogAvgScore = allProductsForKpis.length > 0 ? Math.round(allProductsForKpis.reduce((a, p) => a + p.aiScore, 0) / allProductsForKpis.length) : 0;
  const total24hSales = allProductsForKpis.reduce((a, p) => a + (p.salesCount24h || 0), 0);

  const categoryDist: Record<string, number> = {};
  allProductsForKpis.forEach(p => { categoryDist[p.category] = (categoryDist[p.category] || 0) + 1; });

  const totalImpressions = campaigns.reduce((a, c) => a + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((a, c) => a + (c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((a, c) => a + (c.conversions || 0), 0);
  const totalCampaignRevenue = campaigns.reduce((a, c) => a + Number(c.revenueGeneratedInr || 0), 0);

  const sparkline14Days = [
    { day: "Day 1", revenue: 12800, profit: 4900, orders: 14 }, { day: "Day 2", revenue: 18400, profit: 7100, orders: 21 },
    { day: "Day 3", revenue: 16200, profit: 6300, orders: 19 }, { day: "Day 4", revenue: 24600, profit: 9400, orders: 28 },
    { day: "Day 5", revenue: 28900, profit: 11200, orders: 34 }, { day: "Day 6", revenue: 26100, profit: 10100, orders: 31 },
    { day: "Day 7", revenue: 34200, profit: 13300, orders: 41 }, { day: "Day 8", revenue: 39800, profit: 15400, orders: 47 },
    { day: "Day 9", revenue: 36500, profit: 14100, orders: 44 }, { day: "Day 10", revenue: 44900, profit: 17400, orders: 53 },
    { day: "Day 11", revenue: 51200, profit: 19800, orders: 62 }, { day: "Day 12", revenue: 47600, profit: 18400, orders: 58 },
    { day: "Day 13", revenue: 58400, profit: 22600, orders: 70 }, { day: "Day 14", revenue: 67200, profit: 26100, orders: 82 },
  ];

  return NextResponse.json({
    user,
    kpis: {
      totalRevenueInr: Number(totalRevenue.toFixed(2)), totalNetProfitInr: Number(totalNetProfit.toFixed(2)), totalSupplierCostInr: Number(totalCost.toFixed(2)),
      avgMarginPct, autoFulfillRatePct: autoFulfillRate, activeProductsCount: allProductsForKpis.length,
      pendingOrdersCount: allOrders.filter(o => ["Incoming", "AI Checking"].includes(o.fulfillmentStatus)).length,
      storesConnected: allStores.length, cartItemsCount: allCart.length, cartTotalCostInr: Number(cartTotalCost.toFixed(2)),
      cartProjectedRevenueInr: Number(cartProjectedRevenue.toFixed(2)), cartProjectedProfitInr: Number(cartProjectedProfit.toFixed(2)),
      catalogAvgAiScore: catalogAvgScore, catalogTotalProjectedProfitInr: Math.round(catalogTotalProfit), total24hSalesAcrossCatalog: total24hSales,
      totalCampaigns: campaigns.length, totalImpressions, totalClicks, totalConversions, totalCampaignRevenueInr: Math.round(totalCampaignRevenue),
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
    },
    sparkline14Days, stores: allStores, products: paginatedProducts,
    productsPagination: { page, limit, total: totalFiltered, totalPages: Math.ceil(totalFiltered / limit) },
    categoryDistribution: categoryDist, orders: allOrders, rules: allRules, cartItems: allCart, activityLogs: recentLogs, refreshLogs, campaigns: campaigns.slice(0, 20),
  });
}

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDemoDataSeeded();
    const body = await req.json();
    const { aiAutoPilotEnabled } = body;
    const allUsers = await db.select().from(users).limit(1);
    if (!allUsers[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [updatedUser] = await db.update(users)
      .set({ aiAutoPilotEnabled: Boolean(aiAutoPilotEnabled) })
      .where(eq(users.id, allUsers[0].id))
      .returning();

    await db.insert(aiActivityLogs).values({
      userId: updatedUser.id,
      agentName: "BHARATDROP-CORE // Master Governor",
      actionType: aiAutoPilotEnabled ? "AUTOPILOT_ENGAGED" : "AUTOPILOT_STANDBY",
      message: aiAutoPilotEnabled ? "AI Auto-Pilot ENGAGED — Scout, Delhivery auto-book, Daily Refresh sabhi systems active." : "AI Auto-Pilot Manual Review mode. Auto-fulfillment paused.",
      profitImpactInr: "0.00",
      status: aiAutoPilotEnabled ? "SUCCESS" : "WARNING",
    });

    return NextResponse.json({ user: updatedUser });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
