import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allOrders = await db.select().from(orders).orderBy(desc(orders.orderedAt));
  return NextResponse.json({ orders: allOrders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const productId = Number(body.productId);
    const qty = Number(body.quantity || 1);
    if (!productId || qty < 1 || !body.customerName || !body.customerEmail || !body.customerPhone || !body.customerCity || !body.customerState || !body.customerPincode) {
      return NextResponse.json({ error: "Real order requires productId, quantity, customerName, customerEmail, customerPhone, customerCity, customerState and customerPincode" }, { status: 400 });
    }
    const [target] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!target) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (target.stockCount < qty) return NextResponse.json({ error: "Insufficient verified stock" }, { status: 409 });

    const paid = Number(target.sellingPriceInr) * qty;
    const supplier = (Number(target.supplierCostInr) + Number(target.shippingCostInr)) * qty;
    const gstAmt = Number(target.supplierCostInr) * Number(target.gstPct) / 100 * qty;
    const platformComm = paid * 0.08;
    const netProfit = paid - supplier - gstAmt - platformComm;
    if (netProfit <= 0) return NextResponse.json({ error: "Order economics are no longer profitable; fulfillment blocked" }, { status: 422 });

    const orderNo = `BD-${Date.now()}`;
    const [created] = await db.insert(orders).values({
      userId: Number(body.userId || target.userId), storeId: target.storeId, orderNumber: orderNo,
      customerName: body.customerName, customerEmail: body.customerEmail, customerPhone: body.customerPhone,
      customerCity: body.customerCity, customerState: body.customerState, customerPincode: body.customerPincode,
      productId: target.id, productTitle: target.title, quantity: qty,
      customerPaidInr: paid.toFixed(2), supplierCostInr: supplier.toFixed(2), gstAmountInr: gstAmt.toFixed(2),
      platformCommissionInr: platformComm.toFixed(2), netProfitInr: netProfit.toFixed(2), fulfillmentStatus: "RECHECK_REQUIRED",
      supplierTrackingCode: null, carrierName: null, paymentMode: body.paymentMode || "COD",
      aiDecisionLog: "Real customer order received. Supplier stock, price and fulfillment eligibility must be re-checked before supplier ordering.",
    }).returning();
    await db.insert(aiActivityLogs).values({ userId: created.userId, agentName: "Store-Webhook // Real Order", actionType: "ORDER_RECEIVED", message: `Real order ${orderNo} received for ${target.title}; awaiting supplier re-check.`, profitImpactInr: created.netProfitInr, status: "INFO" });
    return NextResponse.json({ order: created }, { status: 201 });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, fulfillmentStatus, supplierTrackingCode, carrierName, aiDecisionLog } = body;
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    const [updated] = await db.update(orders).set({ ...(fulfillmentStatus && { fulfillmentStatus }), ...(supplierTrackingCode !== undefined && { supplierTrackingCode }), ...(carrierName !== undefined && { carrierName }), ...(aiDecisionLog && { aiDecisionLog }), ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }) }).where(eq(orders.id, Number(id))).returning();
    if (!updated) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Fulfillment-Core // Real Order", actionType: "ORDER_STATUS_CHANGED", message: `Order ${updated.orderNumber} → ${updated.fulfillmentStatus}${updated.supplierTrackingCode ? ` | ${updated.supplierTrackingCode}` : ""}`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ order: updated });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  try { const id = new URL(req.url).searchParams.get("id"); if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 }); await db.delete(orders).where(eq(orders.id, Number(id))); return NextResponse.json({ deleted: true }); }
  catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}
