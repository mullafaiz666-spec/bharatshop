import { db } from "@/db";
import { storefrontOrders, orders, aiActivityLogs } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { appendPaymentMeta, readPaymentMeta } from "@/lib/payments/token-plan";
import { canTransitionPayment, type PaymentState } from "@/lib/payments/payment-events";

export async function markGatewayPayment(input: {
  provider: "razorpay" | "cashfree"; providerOrderId: string; status: PaymentState;
  event: string; paymentId?: string; amountInr?: number; currency?: string;
}) {
  return db.transaction(async tx => {
    const key = `${input.provider}_order_id`;
    const candidates = await tx.select().from(storefrontOrders)
      .where(like(storefrontOrders.notes, `%${key}=${input.providerOrderId}%`)).for("update");
    const matched = candidates.filter(o => readPaymentMeta(o.notes ?? undefined, key) === input.providerOrderId);
    if (input.status === "TOKEN_PAID" && matched.length) {
      const expected = matched.reduce((sum, o) => sum + (String(o.paymentMode).startsWith("PARTIAL_COD_")
        ? Number(readPaymentMeta(o.notes ?? undefined, "confirmation_amount_inr")) : Number(o.totalAmountInr)), 0);
      if (input.currency !== "INR" || !Number.isFinite(input.amountInr) || !Number.isFinite(expected)
        || Math.round(input.amountInr! * 100) !== Math.round(expected * 100)) {
        throw new Error("Gateway amount or currency does not match the stored checkout");
      }
    }
    let updated = 0;
    for (const storefront of matched) {
      if (!canTransitionPayment(storefront.paymentStatus, input.status)) continue;
      const nextFulfillment = input.status === "TOKEN_PAID" ? "CEO_ROUTING_READY" : "PAYMENT_BLOCKED";
      const notes = appendPaymentMeta(storefront.notes ?? undefined, {
        [`${input.provider}_event`]: input.event,
        ...(input.paymentId ? { [`${input.provider}_payment_id`]: input.paymentId } : {}),
      });
      await tx.update(storefrontOrders).set({ paymentStatus: input.status, fulfillmentStatus: nextFulfillment, notes })
        .where(eq(storefrontOrders.id, storefront.id));
      const [core] = await tx.select().from(orders).where(eq(orders.orderNumber, storefront.orderRef)).limit(1);
      if (core) {
        await tx.update(orders).set({ paymentStatus: input.status, fulfillmentStatus: nextFulfillment,
          aiDecisionLog: `${core.aiDecisionLog}; ${input.provider}_event=${input.event}; token_status=${input.status}.`,
        }).where(eq(orders.id, core.id));
        await tx.insert(aiActivityLogs).values({ userId: core.userId, agentName: `${input.provider} Payment Gateway`,
          actionType: `PAYMENT_${input.status}`, message: `${storefront.orderRef}: verified ${input.event}; ${nextFulfillment}.`,
          profitImpactInr: "0.00", metadataJson: { providerOrderId: input.providerOrderId, paymentId: input.paymentId },
          status: input.status === "TOKEN_PAID" ? "SUCCESS" : "ERROR",
        });
      }
      updated++;
    }
    const verified = matched.length > 0 && matched.every(o =>
      (canTransitionPayment(o.paymentStatus, input.status) ? input.status : o.paymentStatus) === "TOKEN_PAID");
    return { matched: matched.length, updated, verified, orderRefs: matched.map(o => o.orderRef),
      codBalanceInr: Number(matched.reduce((sum, o) => sum + (Number(readPaymentMeta(o.notes ?? undefined, "cod_balance_inr")) || 0), 0).toFixed(2)),
      next: verified ? "CEO_ROUTING_READY" : "PAYMENT_BLOCKED" };
  });
}
