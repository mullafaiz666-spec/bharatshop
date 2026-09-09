export type PaymentProvider = "razorpay" | "cashfree";

export function paymentConfig(provider: PaymentProvider) {
  if (provider === "razorpay") {
    return {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    };
  }
  const clientId = process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY;
  return {
    clientId,
    clientSecret,
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || clientSecret,
  };
}

export function assertPaymentConfig(provider: PaymentProvider) {
  const cfg = paymentConfig(provider);
  const missing = Object.entries(cfg).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`${provider} payment configuration missing: ${missing.join(", ")}`);
  return cfg;
}
