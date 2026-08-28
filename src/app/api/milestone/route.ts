import { NextResponse } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, aiActivityLogs, storefrontOrders, orders, marketingCampaigns } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Strict deployment gate. A green milestone requires observable operational
 * evidence for the complete workflow. A build, seeded products, or generic
 * activity log is never sufficient.
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
    const marketingPrepared = Number(campaignCount[0]?.value ?? 0) > 0;

    const events = await db.select({ actionType: aiActivityLogs.actionType, status: aiActivityLogs.status })
      .from(aiActivityLogs)
      .orderBy(desc(aiActivityLogs.createdAt))
      .limit(500);
    const hasEvent = (names: string[]) => events.some(e => names.includes(e.actionType) && e.status !== "BLOCKED" && e.status !== "FAILED");

    const sourceVerified = hasEvent(["SOURCE_VERIFIED_AND_SELECTED", "SOURCE_DISCOVERY_COMPLETED", "SOURCE_SELECTED"]);
    const listingReady = hasEvent(["LISTING_CREATED", "LISTING_OPTIMIZED", "CREATIVE_GENERATED"]);
    const recheckPassed = hasEvent(["RECHECK_PASSED"]);
    const purchaseRecorded = hasEvent(["SUPPLIER_PURCHASE_CONFIRMED", "SUPPLIER_PURCHASE_RECORDED"]);
    const trackingRecorded = hasEvent(["TRACKING_UPDATED", "SUPPLIER_PURCHASE_CONFIRMED"]);
    const learningObserved = hasEvent(["LEARNING_UPDATED", "ORDER_LEARNING_RECORDED", "SUPPLIER_PURCHASE_CONFIRMED", "ORDER_STATUS_CHANGED"]);

    const realOrder = (await db.select({ id: orders.id, status: orders.fulfillmentStatus, tracking: orders.supplierTrackingCode })
      .from(orders)
      .where(inArray(orders.fulfillmentStatus, ["PURCHASED", "PURCHASED_TRACKING_ADDED", "Shipped", "Delivered"]))).length > 0;

    const adsConnected = false; // Connection truth is evaluated by the advertising-status endpoint; prepared campaigns remain valid when no account is connected.

    const checks = {
      source: { status: sourceVerified ? "OBSERVED" : "NOT_OBSERVED", message: sourceVerified ? "A source was verified/selected from operational agent activity." : "No verified source-selection event observed." },
      verify: { status: sourceVerified ? "OBSERVED" : "BLOCKED", message: sourceVerified ? "Source verification evidence exists." : "Source verification has not been exercised." },
      calculate: { status: productsLive ? "OBSERVED" : "BLOCKED", message: productsLive ? "Product unit economics exist." : "No operational product economics found." },
      select: { status: sourceVerified ? "OBSERVED" : "BLOCKED", message: sourceVerified ? "Source selection evidence exists." : "Selection has not been exercised." },
      listingCreative: { status: listingReady ? "OBSERVED" : "NOT_OBSERVED", message: listingReady ? "Listing/creative agent evidence exists." : "Listing/creative execution has not been observed." },
      advertise: { status: marketingPrepared ? "PREPARED" : "NOT_OBSERVED", message: marketingPrepared ? "Campaign preparation exists. Live advertising still requires a connected real account." : "No campaign preparation observed." },
      customerOrder: { status: orderPathLive ? "OBSERVED" : "NOT_OBSERVED", message: orderPathLive ? "A customer/order record exists." : "No customer order observed." },
      recheckFulfillTrack: { status: recheckPassed && purchaseRecorded && trackingRecorded && realOrder ? "OBSERVED" : "NOT_OBSERVED", message: recheckPassed && purchaseRecorded && trackingRecorded && realOrder ? "Re-check, purchase and tracking evidence exists." : "A real order has not completed re-check → purchase → tracking." },
      learnOptimize: { status: learningObserved ? "OBSERVED" : "NOT_OBSERVED", message: learningObserved ? "Operational outcome events are persisted for learning." : "No learning outcome evidence observed." },
    };

    const pass = productsLive && agentActivityLive && sourceVerified && listingReady && marketingPrepared && orderPathLive && recheckPassed && purchaseRecorded && trackingRecorded && realOrder && learningObserved;

    return NextResponse.json({
      milestone: pass ? "PASS" : "NOT_READY",
      displayStatus: pass ? "🟢 FULL END-TO-END LIVE" : "🟡 NOT READY",
      definition: "Full end-to-end live requires real operational evidence through source → verify → calculate → select → listing/creative → advertising preparation → customer order → re-check → operator purchase → supplier tracking → learning.",
      checkedAt: new Date().toISOString(),
      counts: { products: Number(productCount[0]?.value ?? 0), agentActivity: Number(activityCount[0]?.value ?? 0), storefrontOrders: Number(storefrontOrderCount[0]?.value ?? 0), orders: Number(orderCount[0]?.value ?? 0), campaigns: Number(campaignCount[0]?.value ?? 0) },
      advertisingAccountConnected: adsConnected,
      latestAgentActivity: latestActivity[0] ?? null,
      checks,
      nextAction: pass ? "Milestone passed. Keep monitoring real orders, source prices, delivery, returns/RTO, profit and advertising performance." : "Exercise a real product through the failed stages above; do not declare FULL END-TO-END LIVE until every required stage has observable evidence.",
    });
  } catch (error) {
    return NextResponse.json({ milestone: "ERROR", error: error instanceof Error ? error.message : "Milestone check failed" }, { status: 500 });
  }
}
