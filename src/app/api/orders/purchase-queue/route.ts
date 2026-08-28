import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, storefrontOrders, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Manual fulfillment: customer order -> order-time re-check -> CEO authorization -> operator purchase -> tracking. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url); const userId = Number(searchParams.get("userId") ?? 1);
  const rows = await db.select({ order: orders, product: products, storefront: storefrontOrders }).from(orders).leftJoin(products, eq(orders.productId, products.id)).leftJoin(storefrontOrders, eq(orders.orderNumber, storefrontOrders.orderRef)).where(eq(orders.userId, userId)).orderBy(desc(orders.orderedAt));
  const queue = rows.filter(({ order }) => ["RECHECK_REQUIRED", "PURCHASE_PENDING", "Received", "Payment Confirmed"].includes(order.fulfillmentStatus) || order.fulfillmentStatus.startsWith("PURCHASED")).map(({ order, product, storefront }) => {
    const log = order.aiDecisionLog || ""; const rechecked = log.includes("order_time_recheck="); const authorized = log.includes("ceo_authorized=true");
    const address = storefront?.customerAddress || order.customerAddress || `${order.customerCity}, ${order.customerState} - ${order.customerPincode}`;
    return { orderId: order.id, orderNumber: order.orderNumber, customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail, deliveryAddress: address, city: order.customerCity, state: order.customerState, pincode: order.customerPincode }, product: { id: order.productId, title: order.productTitle, quantity: order.quantity, imageUrl: product?.imageUrl ?? null }, source: { name: product?.supplierName ?? "SOURCE_RECHECK_REQUIRED", city: product?.supplierCity ?? "", currentCartPriceInr: Number(order.supplierCostInr) / Math.max(1, order.quantity), shippingInr: product ? Number(product.shippingCostInr) : null, stock: product?.stockCount ?? 0 }, currentCartPriceInr: Number(order.supplierCostInr) / Math.max(1, order.quantity), quantity: order.quantity, totalPurchaseAmountInr: Number(order.supplierCostInr), customerPaidInr: Number(order.customerPaidInr), reCheckStatus: rechecked ? (order.fulfillmentStatus === "RECHECK_REQUIRED" ? "BLOCKED" : "PASSED") : "RECHECK_REQUIRED", ceoAuthorization: authorized ? "AUTHORIZED" : "REQUIRED", fulfillmentStatus: order.fulfillmentStatus, supplierOrderNumber: order.supplierTrackingCode, trackingCode: order.supplierTrackingCode, carrierName: order.carrierName, purchaseAction: order.fulfillmentStatus.startsWith("PURCHASED") ? "PURCHASE_RECORDED" : authorized ? "OPERATOR_PURCHASE_REQUIRED" : "CEO_AUTHORIZATION_REQUIRED" };
  });
  return NextResponse.json({ queue, count: queue.length, workflow: "Customer order → source re-check → CEO authorization → operator purchase → tracking" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); const orderId = Number(body.orderId); if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1); if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const action = String(body.action || "").toLowerCase(); const existingLog = current.aiDecisionLog || "";
    if (action === "recheck") { const origin = new URL(req.url).origin; const response = await fetch(`${origin}/api/agents/recheck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, currentCartPriceInr: body.currentCartPriceInr, shippingCostInr: body.shippingCostInr, stockCount: body.stockCount, deliveryDays: body.deliveryDays, minMarginPct: body.minMarginPct }) }); return NextResponse.json(await response.json(), { status: response.status }); }
    if (action === "authorize") {
      if (current.fulfillmentStatus !== "PURCHASE_PENDING" && !existingLog.includes("order_time_recheck=PASSED")) return NextResponse.json({ error: "Order must pass order-time re-check before CEO authorization" }, { status: 409 });
      const [updated] = await db.update(orders).set({ fulfillmentStatus: "PURCHASE_PENDING", aiDecisionLog: `${existingLog}; ceo_authorized=true; ceo_authorized_at=${new Date().toISOString()}` }).where(eq(orders.id, orderId)).returning();
      await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "CEO-Agent // Purchase Authorization", actionType: "CEO_PURCHASE_AUTHORIZED", message: `CEO authorized supplier purchase for ${updated.orderNumber}. Operator may now purchase from the verified source.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" }); return NextResponse.json({ order: updated, next: "OPERATOR_PURCHASE" });
    }
    if (action === "reject") { const [updated] = await db.update(orders).set({ fulfillmentStatus: "RECHECK_REQUIRED", aiDecisionLog: `${existingLog}; ceo_authorized=false; ceo_rejected_at=${new Date().toISOString()}` }).where(eq(orders.id, orderId)).returning(); return NextResponse.json({ order: updated, next: "RECHECK" }); }
    const supplierOrderNumber = String(body.supplierOrderNumber ?? "").trim(); const trackingCode = String(body.trackingCode ?? "").trim();
    if (action === "purchased" && !supplierOrderNumber) return NextResponse.json({ error: "supplierOrderNumber required" }, { status: 400 });
    if (action === "purchased" && !existingLog.includes("ceo_authorized=true")) return NextResponse.json({ error: "CEO authorization required before supplier purchase" }, { status: 403 });
    const status = action === "purchased" ? (trackingCode ? "PURCHASED_TRACKING_ADDED" : "PURCHASED") : current.fulfillmentStatus;
    const [updated] = await db.update(orders).set({ fulfillmentStatus: status, supplierTrackingCode: trackingCode || supplierOrderNumber || current.supplierTrackingCode, fulfilledAt: action === "purchased" ? new Date() : current.fulfilledAt, aiDecisionLog: `${existingLog}; operator_action=${action || "update"}; supplier_order=${supplierOrderNumber || "pending"}` }).where(eq(orders.id, orderId)).returning();
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Order-Agent // Manual Purchase Queue", actionType: action === "purchased" ? "SUPPLIER_PURCHASE_RECORDED" : "ORDER_QUEUE_UPDATED", message: `Order ${updated.orderNumber}: ${action || "updated"}. Supplier order/tracking: ${supplierOrderNumber || trackingCode || "pending"}.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" }); return NextResponse.json({ order: updated, next: action === "purchased" ? "TRACKING_MONITOR" : "QUEUE" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); }
}
