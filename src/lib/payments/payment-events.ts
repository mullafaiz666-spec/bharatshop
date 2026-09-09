export type PaymentState = "TOKEN_PAID" | "TOKEN_FAILED" | "TOKEN_REFUNDED";

// Never let delayed failure/success notifications reverse settled/refunded orders.
export function canTransitionPayment(current: string, next: PaymentState) {
  if (current === next || ["TOKEN_REFUNDED", "REFUNDED", "CANCELLED"].includes(current)) return false;
  if (current === "PAID" && next === "TOKEN_PAID") return false;
  if (next === "TOKEN_FAILED" && ["TOKEN_PAID", "PAID"].includes(current)) return false;
  return true;
}

export function cashfreePaymentEvent(type: string, paymentStatus: string, refundStatus: string): PaymentState | null {
  if (type === "REFUND_STATUS_WEBHOOK") return refundStatus === "SUCCESS" ? "TOKEN_REFUNDED" : null;
  if (type === "PAYMENT_SUCCESS_WEBHOOK" && paymentStatus === "SUCCESS") return "TOKEN_PAID";
  if (type === "PAYMENT_FAILED_WEBHOOK" && paymentStatus === "FAILED") return "TOKEN_FAILED";
  return null;
}
