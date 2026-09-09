import { NextResponse } from "next/server";
import { cashfreeCredentials, gatewayMode } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const razorpayWebhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
  const cashfree = cashfreeCredentials();
  const cashfreeConfigured = Boolean(cashfree.clientId && cashfree.clientSecret);
  const cashfreeWebhookConfigured = Boolean(process.env.CASHFREE_WEBHOOK_SECRET || cashfree.clientSecret);
  return NextResponse.json({
    partialCod: true,
    strategy: "confirmation_amount_plus_cod_balance",
    mode: gatewayMode(),
    providers: {
      razorpay: { configured: razorpayConfigured, webhookConfigured: razorpayWebhookConfigured },
      cashfree: { configured: cashfreeConfigured, webhookConfigured: cashfreeWebhookConfigured },
    },
    anyConfigured: razorpayConfigured || cashfreeConfigured,
    allConfigured: razorpayConfigured && cashfreeConfigured,
    productionReady: razorpayConfigured && razorpayWebhookConfigured && cashfreeConfigured && cashfreeWebhookConfigured,
  }, { headers: { "Cache-Control": "no-store" } });
}
