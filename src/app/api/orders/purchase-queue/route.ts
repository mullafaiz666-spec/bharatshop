import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, storefrontOrders, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Manual fulfillment: customer order -> order-time re-check -> operator purchase -> tracking. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = Number(searchParams.get("userId") ?? 1);
  const rows = await db.select({ order: orders, product: products, storefront: storefrontOrders })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(storefrontOrders, eq(orders.customerEmail, storefrontOrders.customerEmail))
    .where(eq(orders.userId, userId)).orderBy(desc(orders.orderedAt));

  const queue = rows.filter(({ order }) => ["RECHECK_REQUIRED", "PURCHASE_PENDING", "Received", "Payment Confirmed"].includes(order.fulfillmentStatus) || order.fulfillmentStatus.startsWith("PURCHASED"))
    .map(({ order, product, storefront }) => {
      const log = order.aiDecisionLog || "";
      const rechecked = log.includes("order_time_recheck=");
      const address = storefront?.customerAddress || `${order.customerCity}, ${order.customerState} - ${order.customerPincode}`;
      return {
        orderId: order.id, orderNumber: order.orderNumber,
        customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail, deliveryAddress: address, city: order.customerCity, state: order.customerState, pincode: order.customerPincode },
        product: { id: order.productId, title: order.productTitle, quantity: order.quantity, imageUrl: product?.imageUrl ?? null },
        source: { name: product?.supplierName ?? "SOURCE_RECHECK_REQUIRED", city: product?.supplierCity ?? "", currentCartPriceInr: Number(order.supplierCostInr) / Math.max(1, order.quantity), shippingInr: product ? Number(product.shippingCostInr) : null, stock: product?.stockCount ?? 0 },
        currentCartPriceInr: Number(order.supplierCostInr) / Math.max(1, order.quantity),
        quantity: order.quantity, totalPurchaseAmountInr: Number(order.supplierCostInr), customerPaidInr: Number(order.customerPaidInr),
        reCheckStatus: rechecked ? (order.fulfillmentStatus === "RECHECK_REQUIRED" ? "BLOCKED" : "PASSED") : "RECHECK_REQUIRED",
        fulfillmentStatus: order.fulfillmentStatus, supplierOrderNumber: order.supplierTrackingCode, trackingCode: order.supplierTrackingCode, carrierName: order.carrierName,
        purchaseAction: order.fulfillmentStatus.startsWith("PURCHASED") ? "PURCHASE_RECORDED" : "OPERATOR_PURCHASE_REQUIRED",
      };
    });
  return NextResponse.json({ queue, count: queue.length, workflow: "Customer order → source re-check → operator purchase → tracking" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = Number(body.orderId);
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (body.action === "recheck") {
      const origin = new URL(req.url).origin;
      const response = await fetch(`${origin}/api/agents/recheck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, currentCartPriceInr: body.currentCartPriceInr, shippingCostInr: body.shippingCostInr, stockCount: body.stockCount, deliveryDays: body.deliveryDays, minMarginPct: body.minMarginPct }) });
      return NextResponse.json(await response.json(), { status: response.status });
    }
    const supplierOrderNumber = String(body.supplierOrderNumber ?? "").trim();
    const trackingCode = String(body.trackingCode ?? "").trim();
    if (body.action === "purchased" && !supplierOrderNumber) return NextResponse.json({ error: "supplierOrderNumber required" }, { status: 400 });
    const status = body.action === "purchased" ? (trackingCode ? "PURCHASED_TRACKING_ADDED" : "PURCHASED") : current.fulfillmentStatus;
    const [updated] = await db.update(orders).set({ fulfillmentStatus: status, supplierTrackingCode: trackingCode || supplierOrderNumber || current.supplierTrackingCode, fulfilledAt: body.action === "purchased" ? new Date() : current.fulfilledAt, aiDecisionLog: `${current.aiDecisionLog}; operator_action=${body.action ?? "update"}; supplier_order=${supplierOrderNumber || "pending"}` }).where(eq(orders.id, orderId)).returning();
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Order-Agent // Manual Purchase Queue", actionType: body.action === "purchased" ? "SUPPLIER_PURCHASE_RECORDED" : "ORDER_QUEUE_UPDATED", message: `Order ${updated.orderNumber}: ${body.action ?? "updated"}. Supplier order/tracking: ${supplierOrderNumber || trackingCode || "pending"}.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ order: updated, next: body.action === "purchased" ? "TRACKING_MONITOR" : "QUEUE" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); }
}
