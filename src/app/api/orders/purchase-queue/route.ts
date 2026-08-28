import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Manual fulfillment model:
 * Customer orders BharatShop -> agent verifies source economics -> operator receives
 * a purchase queue -> operator purchases from the source and enters supplier order/tracking.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = Number(searchParams.get("userId") ?? 1);
  const rows = await db.select({ order: orders, product: products })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.orderedAt));

  const queue = rows.filter(({ order }) => ["RECHECK_REQUIRED", "PURCHASE_PENDING", "Received", "Payment Confirmed"].includes(order.fulfillmentStatus))
    .map(({ order, product }) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail, city: order.customerCity, state: order.customerState, pincode: order.customerPincode },
      product: { id: order.productId, title: order.productTitle, quantity: order.quantity, imageUrl: product?.imageUrl ?? null },
      source: { name: product?.supplierName ?? "SOURCE_RECHECK_REQUIRED", city: product?.supplierCity ?? "", acquisitionCostInr: Number(order.supplierCostInr), sourceStatus: product ? "SELECTED_SOURCE_RECHECK" : "MISSING_SOURCE" },
      customerPaidInr: Number(order.customerPaidInr),
      status: order.fulfillmentStatus,
      purchaseUrl: null,
      supplierOrderNumber: order.supplierTrackingCode,
      trackingCode: order.supplierTrackingCode,
      carrierName: order.carrierName,
      action: "OPERATOR_PURCHASE_REQUIRED",
    }));

  return NextResponse.json({ queue, count: queue.length, workflow: "Customer order → source re-check → operator purchase → tracking" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = Number(body.orderId);
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const status = body.action === "purchased" ? "PURCHASED" : body.action === "recheck" ? "RECHECK_REQUIRED" : current.fulfillmentStatus;
    const supplierOrderNumber = body.supplierOrderNumber ? String(body.supplierOrderNumber) : current.supplierTrackingCode;
    const trackingCode = body.trackingCode ? String(body.trackingCode) : current.supplierTrackingCode;
    const [updated] = await db.update(orders).set({ fulfillmentStatus: status, supplierTrackingCode: trackingCode, fulfilledAt: status === "PURCHASED" ? new Date() : current.fulfilledAt, aiDecisionLog: `${current.aiDecisionLog}; operator_action=${body.action ?? "update"}; supplier_order=${supplierOrderNumber ?? "pending"}` }).where(eq(orders.id, orderId)).returning();

    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Order-Agent // Manual Purchase Queue", actionType: body.action === "purchased" ? "SUPPLIER_PURCHASE_RECORDED" : "ORDER_RECHECKED", message: `Order ${updated.orderNumber}: ${body.action ?? "updated"}. Supplier order/tracking: ${supplierOrderNumber ?? "pending"}.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ order: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); }
}
