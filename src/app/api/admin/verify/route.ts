import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users, stores, products, productImages, cartItems, orders,
  automationRules, productRefreshLogs, marketingCampaigns,
  storefrontOrders, shopifySyncLogs, aiActivityLogs,
} from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { isSearxngConfigured } from "@/lib/searxng";
import { requireAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// CEO / operator-facing DB verification endpoint.
// Returns a live row count for every table so deployment health can be
// confirmed at a glance — no guessing whether seeding / migrations ran.
export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [
      [usersC], [storesC], [productsC], [imagesC], [cartC], [ordersC],
      [rulesC], [refreshLogsC], [campaignsC], [storefrontOrdersC], [shopifySyncC], [activityC],
      [searxngImgC], [fallbackImgC],
    ] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(users),
      db.select({ n: sql<number>`count(*)::int` }).from(stores),
      db.select({ n: sql<number>`count(*)::int` }).from(products),
      db.select({ n: sql<number>`count(*)::int` }).from(productImages),
      db.select({ n: sql<number>`count(*)::int` }).from(cartItems),
      db.select({ n: sql<number>`count(*)::int` }).from(orders),
      db.select({ n: sql<number>`count(*)::int` }).from(automationRules),
      db.select({ n: sql<number>`count(*)::int` }).from(productRefreshLogs),
      db.select({ n: sql<number>`count(*)::int` }).from(marketingCampaigns),
      db.select({ n: sql<number>`count(*)::int` }).from(storefrontOrders),
      db.select({ n: sql<number>`count(*)::int` }).from(shopifySyncLogs),
      db.select({ n: sql<number>`count(*)::int` }).from(aiActivityLogs),
      db.select({ n: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.verificationStatus, "VERIFIED")),
      db.select({ n: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.verificationStatus, "FALLBACK")),
    ]);

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      database: {
        users: usersC.n,
        stores: storesC.n,
        products: productsC.n,
        productImages: imagesC.n,
        cartItems: cartC.n,
        orders: ordersC.n,
        automationRules: rulesC.n,
        productRefreshLogs: refreshLogsC.n,
        marketingCampaigns: campaignsC.n,
        storefrontOrders: storefrontOrdersC.n,
        shopifySyncLogs: shopifySyncC.n,
        aiActivityLogs: activityC.n,
      },
      imagePipeline: {
        searxngConfigured: isSearxngConfigured(),
        searxngUrl: process.env.SEARXNG_URL ? new URL(process.env.SEARXNG_URL).hostname : null,
        totalResolvedImages: imagesC.n,
        resolvedViaSearxng: searxngImgC.n,
        resolvedViaFallback: fallbackImgC.n,
        productsMissingAnyImage: Math.max(0, productsC.n - imagesC.n),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "DB verification failed",
    }, { status: 500 });
  }
}
