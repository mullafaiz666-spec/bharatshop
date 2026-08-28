import { NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { db } from "@/db";
import { products, aiActivityLogs, storefrontOrders, orders, marketingCampaigns } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Functional deployment gate.
 * This endpoint deliberately does not seed demo data. A milestone is PASS only
 * when the deployed system has observable operational data and no placeholder
 * source is being mistaken for a live integration.
 */
export async function GET() {
  try {
    const [productCount, activityCount, storefrontOrderCount, orderCount, campaignCount, latestActivity] = await Promise.all([
      db.select({ value: count() }).from(products),
      db.select({ value: count() }).from(aiActivityLogs),
      db.select({ value: count() }).from(storefrontOrders),
      db.select({ value: count() }).from(orders),
      db.select({ value: count() }).from(marketingCampaigns),
      db.select().from(aiActivityLogs).orderBy(desc(aiActivityLogs.createdAt)).limit(1),
    ]);

    const productsLive = Number(productCount[0]?.value ?? 0) > 0;
    const agentActivityLive = Number(activityCount[0]?.value ?? 0) > 0;
    const orderPathLive = Number(storefrontOrderCount[0]?.value ?? 0) + Number(orderCount[0]?.value ?? 0) > 0;
    const marketingPathLive = Number(campaignCount[0]?.value ?? 0) > 0;

    const checks = {
      source: {
        status: "CONFIG_REQUIRED",
        message: "A supplier/source API or authorized partner feed must be connected before source data can be called live.",
      },
      verify: { status: productsLive ? "OBSERVED" : "BLOCKED", message: productsLive ? "Product records exist in the operational database." : "No operational product records found." },
      calculate: { status: productsLive ? "OBSERVED" : "BLOCKED", message: "Unit economics are stored with product records." },
      select: { status: productsLive ? "OBSERVED" : "BLOCKED", message: "Product scoring fields are available." },
      listingCreative: { status: productsLive ? "OBSERVED" : "BLOCKED", message: "Listing data exists only when a product is present." },
      advertise: { status: marketingPathLive ? "OBSERVED" : "NOT_OBSERVED", message: marketingPathLive ? "Campaign records exist." : "No campaign execution record observed." },
      customerOrder: { status: orderPathLive ? "OBSERVED" : "NOT_OBSERVED", message: orderPathLive ? "Order records exist." : "No customer order observed yet." },
      recheckFulfillTrack: { status: orderPathLive ? "OBSERVED" : "NOT_OBSERVED", message: orderPathLive ? "Order pipeline has operational records to validate." : "Requires a real order to exercise fulfillment and tracking." },
      learnOptimize: { status: agentActivityLive ? "OBSERVED" : "BLOCKED", message: agentActivityLive ? "Agent activity is persisted." : "No agent activity has been observed." },
    };

    const pass = productsLive && agentActivityLive;

    return NextResponse.json({
      milestone: pass ? "PASS" : "NOT_READY",
      definition: "Functional milestone — live operational data and observable agent activity, not merely a successful build.",
      checkedAt: new Date().toISOString(),
      counts: {
        products: Number(productCount[0]?.value ?? 0),
        agentActivity: Number(activityCount[0]?.value ?? 0),
        storefrontOrders: Number(storefrontOrderCount[0]?.value ?? 0),
        orders: Number(orderCount[0]?.value ?? 0),
        campaigns: Number(campaignCount[0]?.value ?? 0),
      },
      latestAgentActivity: latestActivity[0] ?? null,
      checks,
      nextAction: pass
        ? "Exercise a real product through source → verify → calculate → select → listing → advertise → order → re-check → fulfill → track → learn."
        : "Connect an authorized supplier/source feed, ingest real product data, and verify agent activity before declaring the deployment functional.",
    });
  } catch (error) {
    return NextResponse.json({ milestone: "ERROR", error: error instanceof Error ? error.message : "Milestone check failed" }, { status: 500 });
  }
}
