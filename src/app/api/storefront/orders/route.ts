import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders, orders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url); const status = searchParams.get("status"); const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50"), 1), 100);
  const all = await db.select().from(storefrontOrders).orderBy(desc(storefrontOrders.orderedAt)).limit(limit); const filtered = status && status !== "ALL" ? all.filter(o => o.fulfillmentStatus === status) : all;
  return NextResponse.json({ orders: filtered, total: filtered.length });
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); const { customerName, customerEmail, customerPhone, customerAddress, customerCity, customerState, customerPincode, productId, quantity = 1, paymentMode = "COD" } = body;
    if (!customerName || !customerEmail || !customerPhone || !productId) return NextResponse.json({ error: "Name, email, phone, productId required" }, { status: 400 });
    const qty = Number(quantity); if (!Number.isInteger(qty) || qty < 1 || qty > 100) return NextResponse.json({ error: "Quantity must be an integer between 1 and 100" }, { status: 400 });
    const normalizedPaymentMode = String(paymentMode).toUpperCase(); if (!["COD", "RAZORPAY", "CASHFREE"].includes(normalizedPaymentMode)) return NextResponse.json({ error: "Unsupported payment mode" }, { status: 400 });
    const [product] = await db.select().from(products).where(eq(products.id, Number(productId))); if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (product.status !== "Published") return NextResponse.json({ error: "Product is not currently published" }, { status: 409 });
    if (Number(product.stockCount) < qty) return NextResponse.json({ error: "Insufficient stock" }, { status: 409 });
    const unitPrice = Number(product.sellingPriceInr); const total = (unitPrice * qty).toFixed(2); const ref = `BD-WEB-${Date.now().toString(36).toUpperCase()}`;
    const paymentStatus = "PENDING"; const fulfillmentStatus = normalizedPaymentMode === "COD" ? "RECHECK_REQUIRED" : "PAYMENT_PENDING";
    const [created] = await db.insert(storefrontOrders).values({ orderRef: ref, customerName: String(customerName).trim(), customerEmail: String(customerEmail).trim(), customerPhone: String(customerPhone).trim(), customerAddress: String(customerAddress || "").trim(), customerCity: String(customerCity || "").trim(), customerState: String(customerState || "").trim(), customerPincode: String(customerPincode || "").trim(), productId: product.id, productTitle: product.title, productImageUrl: product.imageUrl, quantity: qty, sellingPriceInr: unitPrice.toFixed(2), totalAmountInr: total, paymentMode: normalizedPaymentMode, paymentStatus, fulfillmentStatus, source: "own_website" }).returning();
    const supplierTotal = (Number(product.supplierCostInr) + Number(product.shippingCostInr)) * qty; const gstAmount = Number(product.supplierCostInr) * Number(product.gstPct) / 100 * qty; const commission = Number(total) * 0.08; const netProfit = Number(total) - supplierTotal - gstAmount - commission;
    const [core] = await db.insert(orders).values({ userId: product.userId, storeId: product.storeId, orderNumber: ref, customerName: created.customerName, customerEmail: created.customerEmail, customerPhone: created.customerPhone, customerAddress: created.customerAddress, customerCity: created.customerCity, customerState: created.customerState, customerPincode: created.customerPincode, productId: product.id, productTitle: product.title, quantity: qty, customerPaidInr: total, supplierCostInr: supplierTotal.toFixed(2), gstAmountInr: gstAmount.toFixed(2), platformCommissionInr: commission.toFixed(2), netProfitInr: netProfit.toFixed(2), fulfillmentStatus, supplierTrackingCode: null, carrierName: null, paymentMode: normalizedPaymentMode, paymentStatus, aiDecisionLog: `Storefront order ${ref} created. source=own_website; payment=${normalizedPaymentMode}; fulfillment gate=${fulfillmentStatus}; CEO authorization required before supplier purchase.` }).returning();
    await db.insert(aiActivityLogs).values({ userId: product.userId, agentName: "Website-Storefront // Order Gateway", actionType: "STOREFRONT_ORDER", message: `New website order ${ref} — ${String(customerName).trim()} ordered "${product.title.slice(0, 50)}" × ${qty}. Total: ₹${total}. Gate: ${fulfillmentStatus}`, profitImpactInr: String(core.netProfitInr), status: "SUCCESS" });
    return NextResponse.json({ order: created, fulfillmentOrder: core, ref }, { status: 201 });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Order error" }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json(); const { id, fulfillmentStatus, trackingCode, carrierName } = body; if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    const allowedFulfillment = ["RECHECK_REQUIRED", "PURCHASE_PENDING", "Received", "AI Checking", "Supplier Ordered", "In Transit", "Delivered", "Cancelled"]; if (fulfillmentStatus && !allowedFulfillment.includes(fulfillmentStatus)) return NextResponse.json({ error: "Invalid fulfillment status" }, { status: 400 });
    const [updated] = await db.update(storefrontOrders).set({ ...(fulfillmentStatus && { fulfillmentStatus }), ...(trackingCode && { trackingCode: String(trackingCode) }), ...(carrierName && { carrierName: String(carrierName) }), ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }) }).where(eq(storefrontOrders.id, Number(id))).returning(); if (!updated) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    await db.update(orders).set({ ...(fulfillmentStatus && { fulfillmentStatus }), ...(trackingCode && { supplierTrackingCode: String(trackingCode) }), ...(carrierName && { carrierName: String(carrierName) }), ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }) }).where(eq(orders.orderNumber, updated.orderRef)); return NextResponse.json({ order: updated });
  } catch (err: unknown) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export const dynamic = "force-dynamic";
