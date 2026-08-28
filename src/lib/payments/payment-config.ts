export type PaymentProvider = "razorpay" | "cashfree";

export function paymentConfig(provider: PaymentProvider) {
  if (provider === "razorpay") return { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET };
  return { clientId: process.env.CASHFREE_CLIENT_ID, clientSecret: process.env.CASHFREE_CLIENT_SECRET, webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET };
}

export function assertPaymentConfig(provider: PaymentProvider) {
  const cfg = paymentConfig(provider);
  const missing = Object.entries(cfg).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`${provider} payment configuration missing: ${missing.join(", ")}`);
  return cfg;
}
