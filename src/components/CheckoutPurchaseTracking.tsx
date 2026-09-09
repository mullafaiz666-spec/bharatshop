"use client";

import { useEffect } from "react";

type Props = {
  provider: "cashfree" | "razorpay";
  gatewayOrderId: string;
  valueInr?: number;
  orderRefs?: string[];
};

type PendingCheckout = { refs?: string[]; confirmationAmountInr?: number; codBalanceInr?: number };

export default function CheckoutPurchaseTracking({ provider, gatewayOrderId, valueInr, orderRefs = [] }: Props) {
  useEffect(() => {
    if (!gatewayOrderId) return;
    const sharedEventId = `${provider}:${gatewayOrderId}:purchase`;
    const storageKey = `bharatshop_meta_purchase:${sharedEventId}`;
    let resolvedValue = Number(valueInr);
    let resolvedRefs = orderRefs;

    try {
      const raw = sessionStorage.getItem("bharatshop_pending_checkout");
      if (raw) {
        const pending = JSON.parse(raw) as PendingCheckout;
        const checkoutValue = Number(pending.confirmationAmountInr || 0) + Number(pending.codBalanceInr || 0);
        if (!Number.isFinite(resolvedValue) || resolvedValue <= 0) resolvedValue = checkoutValue;
        if (!resolvedRefs.length && Array.isArray(pending.refs)) resolvedRefs = pending.refs.map(String);
      }
    } catch {}

    if (!Number.isFinite(resolvedValue) || resolvedValue < 0) resolvedValue = 0;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (sessionStorage.getItem(storageKey) === "sent") {
        window.clearInterval(timer);
        return;
      }
      if (window.bharatTrackMeta) {
        window.bharatTrackMeta("purchase", {
          currency: "INR",
          value: Number(resolvedValue.toFixed(2)),
          order_refs: resolvedRefs,
        }, sharedEventId);
        sessionStorage.setItem(storageKey, "sent");
        sessionStorage.removeItem("bharatshop_pending_checkout");
        window.clearInterval(timer);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [gatewayOrderId, orderRefs, provider, valueInr]);

  return null;
}
