import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured on the server." }, { status: 503 });
    }

    const { orderRef } = await req.json();
    if (!orderRef) return NextResponse.json({ error: "orderRef is required" }, { status: 400 });

    const [order] = await db.select().from(storefrontOrders).where(eq(storefrontOrders.orderRef, String(orderRef)));
    if (!order) return NextResponse.json({ error: "Storefront order not found" }, { status: 404 });
    if (order.paymentMode === "COD") return NextResponse.json({ error: "COD orders do not need a Razorpay order." }, { status: 400 });
    if (order.paymentStatus === "PAID") return NextResponse.json({ error: "Order is already paid." }, { status: 409 });

    const amount = Math.round(Number(order.totalAmountInr) * 100);
    if (!Number.isInteger(amount) || amount < 100) return NextResponse.json({ error: "Invalid payment amount." }, { status: 400 });

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: order.orderRef,
        notes: { orderRef: order.orderRef },
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.id) {
      return NextResponse.json({ error: payload?.error?.description || "Unable to create Razorpay order" }, { status: 502 });
    }

    const existingNotes = order.notes || "";
    const notes = `${existingNotes}${existingNotes ? " | " : ""}razorpay_order_id=${payload.id}`;
    await db.update(storefrontOrders).set({ notes }).where(eq(storefrontOrders.id, order.id));

    return NextResponse.json({
      keyId,
      razorpayOrderId: payload.id,
      amount: payload.amount,
      currency: payload.currency,
      orderRef: order.orderRef,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Razorpay order creation failed" }, { status: 500 });
  }
}
