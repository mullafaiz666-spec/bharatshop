import crypto from "node:crypto";

export type Gateway = "razorpay" | "cashfree";

export function gatewayMode() { return process.env.PAYMENT_MODE === "live" ? "live" : "test"; }

export async function createRazorpayOrder(input: { amountInr: number; receipt: string; notes?: Record<string,string> }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured");
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: Math.round(input.amountInr * 100), currency: "INR", receipt: input.receipt, notes: input.notes || {} }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || "Razorpay order creation failed");
  return { provider: "razorpay" as const, mode: gatewayMode(), orderId: data.id, amount: data.amount, currency: data.currency, keyId };
}

export async function createCashfreeOrder(input: { orderId: string; amountInr: number; customer: { name: string; email: string; phone: string } }) {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Cashfree keys are not configured");
  const base = gatewayMode() === "live" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  const res = await fetch(`${base}/orders`, { method: "POST", headers: { "x-client-id": clientId, "x-client-secret": clientSecret, "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01", "Content-Type": "application/json" }, body: JSON.stringify({ order_id: input.orderId, order_amount: Number(input.amountInr.toFixed(2)), order_currency: "INR", customer_details: { customer_id: input.orderId, customer_name: input.customer.name, customer_email: input.customer.email, customer_phone: input.customer.phone }, order_meta: { return_url: `${process.env.PUBLIC_APP_URL || ""}/checkout/success?order_id=${encodeURIComponent(input.orderId)}` } }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Cashfree order creation failed");
  return { provider: "cashfree" as const, mode: gatewayMode(), orderId: data.order_id, paymentSessionId: data.payment_session_id };
}

export function verifyRazorpayWebhook(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyCashfreeWebhook(rawBody: string, timestamp: string, signature: string) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
