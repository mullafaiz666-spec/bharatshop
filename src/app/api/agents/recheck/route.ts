import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = Number(body.orderId);
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const [row] = await db.select({ order: orders, product: products }).from(orders).leftJoin(products, eq(orders.productId, products.id)).where(eq(orders.id, orderId)).limit(1);
    if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const o = row.order, p = row.product;
    if (!p) return NextResponse.json({ error: "No selected source/product is attached to this order", status: "BLOCKED" }, { status: 409 });
    const cartPrice = Number(body.currentCartPriceInr ?? p.supplierCostInr);
    const shipping = Number(body.shippingCostInr ?? p.shippingCostInr);
    const stock = Number(body.stockCount ?? p.stockCount);
    const deliveryDays = Number(body.deliveryDays ?? 7);
    const margin = Number(o.customerPaidInr) > 0 ? (Number(o.customerPaidInr) - cartPrice - shipping) / Number(o.customerPaidInr) * 100 : 0;
    const minMargin = Number(body.minMarginPct ?? 35);
    const checks = { stock: stock > 0, cartPrice: cartPrice > 0, shipping: shipping >= 0, delivery: deliveryDays > 0 && deliveryDays <= Number(body.maxDeliveryDays ?? 15), margin: margin >= minMargin };
    const passed = Object.values(checks).every(Boolean);
    const status = passed ? "PURCHASE_PENDING" : "RECHECK_REQUIRED";
    const decision = { checkedAt: new Date().toISOString(), source: p.supplierName, cartPriceInr: cartPrice, shippingInr: shipping, stock, deliveryDays, marginPct: +margin.toFixed(2), minMarginPct: minMargin, checks, passed };
    const [updated] = await db.update(orders).set({ supplierCostInr: String(cartPrice), fulfillmentStatus: status, aiDecisionLog: `${o.aiDecisionLog}; order_time_recheck=${JSON.stringify(decision)}` }).where(eq(orders.id, orderId)).returning();
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Order-Recheck-Agent", actionType: passed ? "RECHECK_PASSED" : "RECHECK_BLOCKED", message: `Order ${updated.orderNumber}: ${passed ? "all order-time economics checks passed" : "purchase blocked pending re-check"}.`, profitImpactInr: String(updated.netProfitInr), metadataJson: decision, status: passed ? "SUCCESS" : "BLOCKED" });
    return NextResponse.json({ status, passed, checks, economics: decision, order: updated });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 }); }
}
