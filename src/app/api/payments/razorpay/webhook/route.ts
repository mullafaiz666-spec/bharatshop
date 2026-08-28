import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders, orders, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqualHex(a: string, b: string) {
  try { const aa = Buffer.from(a, "hex"); const bb = Buffer.from(b, "hex"); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); } catch { return false; }
}

export async function POST(req: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: "Razorpay webhook secret is not configured." }, { status: 503 });
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!signature || !safeEqualHex(expected, signature)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

    const event = JSON.parse(rawBody);
    const eventName = String(event?.event || "");
    const payment = event?.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
    if (!razorpayOrderId) return NextResponse.json({ received: true });

    const allStoreOrders = await db.select().from(storefrontOrders);
    const storefront = allStoreOrders.find(o => (o.notes || "").includes(`razorpay_order_id=${razorpayOrderId}`));
    if (!storefront) return NextResponse.json({ received: true, matched: false });

    let paymentStatus: string | undefined;
    if (["payment.captured", "order.paid"].includes(eventName)) paymentStatus = "PAID";
    else if (eventName === "payment.failed") paymentStatus = "FAILED";
    else if (["payment.refunded", "refund.created"].includes(eventName)) paymentStatus = "REFUNDED";
    if (!paymentStatus) return NextResponse.json({ received: true, matched: true, event: eventName });

    const notes = `${storefront.notes || ""}${storefront.notes ? " | " : ""}razorpay_event=${eventName}`;
    await db.update(storefrontOrders).set({ paymentStatus, notes }).where(eq(storefrontOrders.id, storefront.id));

    const [core] = await db.select().from(orders).where(eq(orders.orderNumber, storefront.orderRef)).limit(1);
    if (core) {
      const nextFulfillment = paymentStatus === "PAID" ? "RECHECK_REQUIRED" : paymentStatus === "FAILED" || paymentStatus === "REFUNDED" ? "PAYMENT_BLOCKED" : core.fulfillmentStatus;
      await db.update(orders).set({ paymentStatus, fulfillmentStatus: nextFulfillment, aiDecisionLog: `${core.aiDecisionLog}; razorpay_event=${eventName}; payment_status=${paymentStatus}.` }).where(eq(orders.id, core.id));
    }

    await db.insert(aiActivityLogs).values({ userId: core?.userId ?? 1, agentName: "Razorpay // Payment Webhook", actionType: `PAYMENT_${paymentStatus}`, message: `${storefront.orderRef}: verified Razorpay event ${eventName}; core fulfillment gate updated.`, profitImpactInr: paymentStatus === "PAID" ? storefront.totalAmountInr : "0.00", status: paymentStatus === "FAILED" ? "ERROR" : "SUCCESS" });
    return NextResponse.json({ received: true, matched: true, paymentStatus, fulfillmentStatus: core?.fulfillmentStatus });
  } catch (error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, { status: 500 }); }
}
