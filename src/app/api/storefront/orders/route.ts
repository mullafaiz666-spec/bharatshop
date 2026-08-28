import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50"), 1), 100);
  const all = await db.select().from(storefrontOrders).orderBy(desc(storefrontOrders.orderedAt)).limit(limit);
  const filtered = status && status !== "ALL" ? all.filter(o => o.fulfillmentStatus === status) : all;
  return NextResponse.json({ orders: filtered, total: filtered.length });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      customerName, customerEmail, customerPhone, customerAddress,
      customerCity, customerState, customerPincode,
      productId, quantity = 1, paymentMode = "COD",
    } = body;

    if (!customerName || !customerEmail || !customerPhone || !productId) {
      return NextResponse.json({ error: "Name, email, phone, productId required" }, { status: 400 });
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return NextResponse.json({ error: "Quantity must be an integer between 1 and 100" }, { status: 400 });
    }
    const normalizedPaymentMode = String(paymentMode).toUpperCase();
    if (!["COD", "RAZORPAY", "CASHFREE"].includes(normalizedPaymentMode)) {
      return NextResponse.json({ error: "Unsupported payment mode" }, { status: 400 });
    }

    const found = await db.select().from(products).where(eq(products.id, Number(productId)));
    const product = found[0];
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (Number(product.stockCount) < qty) return NextResponse.json({ error: "Insufficient stock" }, { status: 409 });

    const unitPrice = Number(product.sellingPriceInr);
    const total = (unitPrice * qty).toFixed(2);
    const ref = `BD-WEB-${Date.now().toString(36).toUpperCase()}`;

    const [created] = await db.insert(storefrontOrders).values({
      orderRef: ref,
      customerName: String(customerName).trim(), customerEmail: String(customerEmail).trim(), customerPhone: String(customerPhone).trim(),
      customerAddress: String(customerAddress || "").trim(),
      customerCity: String(customerCity || "Mumbai").trim(), customerState: String(customerState || "Maharashtra").trim(), customerPincode: String(customerPincode || "400001").trim(),
      productId: product.id, productTitle: product.title, productImageUrl: product.imageUrl,
      quantity: qty, sellingPriceInr: unitPrice.toFixed(2), totalAmountInr: total,
      paymentMode: normalizedPaymentMode,
      paymentStatus: normalizedPaymentMode === "COD" ? "PENDING" : "PENDING",
      fulfillmentStatus: "Received", source: "own_website",
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId: product.userId,
      agentName: "Website-Storefront // Order Gateway",
      actionType: "STOREFRONT_ORDER",
      message: `New website order ${ref} — ${String(customerName).trim()} ordered "${product.title.slice(0, 50)}" × ${qty}. Total: ₹${total}`,
      profitImpactInr: String(Number(product.netProfitInr) * qty), status: "SUCCESS",
    });

    return NextResponse.json({ order: created, ref }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, fulfillmentStatus, trackingCode, carrierName } = body;
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const allowedFulfillment = ["Received", "AI Checking", "Supplier Ordered", "In Transit", "Delivered", "Cancelled"];
    if (fulfillmentStatus && !allowedFulfillment.includes(fulfillmentStatus)) return NextResponse.json({ error: "Invalid fulfillment status" }, { status: 400 });

    const [updated] = await db.update(storefrontOrders).set({
      ...(fulfillmentStatus && { fulfillmentStatus }),
      ...(trackingCode && { trackingCode: String(trackingCode) }),
      ...(carrierName && { carrierName: String(carrierName) }),
      ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }),
    }).where(eq(storefrontOrders.id, Number(id))).returning();

    if (!updated) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
