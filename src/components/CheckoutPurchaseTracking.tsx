"use client";

import { useEffect } from "react";

type Props = {
  provider: "cashfree" | "razorpay";
  gatewayOrderId: string;
  valueInr: number;
  orderRefs?: string[];
};

export default function CheckoutPurchaseTracking({ provider, gatewayOrderId, valueInr, orderRefs = [] }: Props) {
  useEffect(() => {
    if (!gatewayOrderId || !Number.isFinite(valueInr) || valueInr < 0) return;
    const sharedEventId = `${provider}:${gatewayOrderId}:purchase`;
    const storageKey = `bharatshop_meta_purchase:${sharedEventId}`;
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
          value: Number(valueInr.toFixed(2)),
          order_refs: orderRefs,
        }, sharedEventId);
        sessionStorage.setItem(storageKey, "sent");
        window.clearInterval(timer);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [gatewayOrderId, orderRefs, provider, valueInr]);

  return null;
}
