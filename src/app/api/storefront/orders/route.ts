import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");
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

    const found = await db.select().from(products).where(eq(products.id, Number(productId)));
    const product = found[0];
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const qty = Number(quantity);
    const unitPrice = Number(product.sellingPriceInr);
    const total = (unitPrice * qty).toFixed(2);
    const ref = `BD-WEB-${Date.now().toString(36).toUpperCase()}`;

    const [created] = await db.insert(storefrontOrders).values({
      orderRef: ref,
      customerName, customerEmail, customerPhone,
      customerAddress: customerAddress || "",
      customerCity: customerCity || "Mumbai",
      customerState: customerState || "Maharashtra",
      customerPincode: customerPincode || "400001",
      productId: product.id,
      productTitle: product.title,
      productImageUrl: product.imageUrl,
      quantity: qty,
      sellingPriceInr: unitPrice.toFixed(2),
      totalAmountInr: total,
      paymentMode,
      paymentStatus: paymentMode === "COD" ? "PENDING" : "PAID",
      fulfillmentStatus: "Received",
      source: "own_website",
    }).returning();

    // Log to AI stream
    await db.insert(aiActivityLogs).values({
      userId: 1,
      agentName: "Website-Storefront // Order Gateway",
      actionType: "STOREFRONT_ORDER",
      message: `New website order ${ref} — ${customerName} (${customerCity}) ordered "${product.title.slice(0, 50)}" × ${qty}. Total: ₹${total}`,
      profitImpactInr: String(Number(product.netProfitInr) * qty),
      status: "SUCCESS",
    });

    return NextResponse.json({ order: created, ref }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, fulfillmentStatus, trackingCode, carrierName, paymentStatus } = body;
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const [updated] = await db.update(storefrontOrders).set({
      ...(fulfillmentStatus && { fulfillmentStatus }),
      ...(trackingCode && { trackingCode }),
      ...(carrierName && { carrierName }),
      ...(paymentStatus && { paymentStatus }),
      ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }),
    }).where(eq(storefrontOrders.id, Number(id))).returning();

    return NextResponse.json({ order: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
