import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { markGatewayPayment } from "@/lib/payments/order-state";
import { safeSignatureEqual } from "@/lib/payments/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET, keyId = process.env.RAZORPAY_KEY_ID;
    if (!secret || !keyId) return NextResponse.json({ error: "Razorpay is not configured" }, { status: 503 });
    const body = await req.json(), orderId = String(body.razorpay_order_id || ""), paymentId = String(body.razorpay_payment_id || ""), signature = String(body.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) return NextResponse.json({ error: "Missing Razorpay verification fields" }, { status: 400 });
    const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    if (!safeSignatureEqual(expected, signature)) return NextResponse.json({ error: "Invalid payment signature" }, { status: 401 });
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}` },
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({ error: "Unable to verify payment with Razorpay" }, { status: 502 });
    const payment = await response.json();
    if (payment.order_id !== orderId || payment.status !== "captured" || payment.captured !== true) {
      return NextResponse.json({ verified: false, error: "Payment is not captured yet. Please check again shortly." }, { status: 409 });
    }
    const state = await markGatewayPayment({ provider: "razorpay", providerOrderId: orderId, status: "TOKEN_PAID",
      event: "payment.capture_verified", paymentId, amountInr: Number(payment.amount) / 100, currency: payment.currency });
    if (!state.matched) return NextResponse.json({ error: "No BharatShop orders matched this payment" }, { status: 404 });
    return NextResponse.json({ paymentStatus: state.verified ? "TOKEN_PAID" : "PAYMENT_BLOCKED", ...state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Razorpay verification failed" }, { status: 500 });
  }
}
