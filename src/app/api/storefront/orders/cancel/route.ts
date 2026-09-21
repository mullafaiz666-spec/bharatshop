import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs, orders, storefrontOrders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { releaseInventoryReservation } from "@/lib/orders/inventory-reservation";
import { appendPaymentMeta, readPaymentMeta } from "@/lib/payments/token-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expectedOrderRef(key: string) {
  return `BS-WEB-${createHash("sha256").update(key).digest("hex")}`;
}

function cleanReason(value: unknown) {
  return String(value || "checkout_cancelled").replace(/[|\r\n]/g, " ").trim().slice(0, 80) || "checkout_cancelled";
}

export async function POST(req: Request) {
  try {
    const key = String(req.headers.get("Idempotency-Key") || "").trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) return NextResponse.json({ error: "Valid Idempotency-Key is required" }, { status: 400 });
    const body = await req.json().catch(() => ({})) as { orderRef?: unknown; reason?: unknown };
    const orderRef = String(body.orderRef || "").trim();
    if (!orderRef || orderRef !== expectedOrderRef(key)) return NextResponse.json({ error: "Order cancellation key does not match" }, { status: 403 });
    const reason = cleanReason(body.reason);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderRef}, 0))`);
      const [storefront] = await tx.select().from(storefrontOrders).where(eq(storefrontOrders.orderRef, orderRef)).limit(1).for("update");
      if (!storefront) return NextResponse.json({ error: "Order not found" }, { status: 404 });

      const paymentStatus = String(storefront.paymentStatus || "").toUpperCase();
      const fulfillmentStatus = String(storefront.fulfillmentStatus || "").toUpperCase();
      if (["TOKEN_PAID", "PAID", "TOKEN_REFUNDED", "REFUNDED"].includes(paymentStatus)) {
        return NextResponse.json({ error: "Paid or refunded orders require the verified refund/cancellation workflow" }, { status: 409 });
      }
      const gatewayOrderId = readPaymentMeta(storefront.notes ?? undefined, "razorpay_order_id") || readPaymentMeta(storefront.notes ?? undefined, "cashfree_order_id");
      if (gatewayOrderId && fulfillmentStatus !== "CANCELLED") {
        return NextResponse.json({ error: "A payment session already exists; inventory cannot be released until gateway state is verified" }, { status: 409 });
      }

      const release = await releaseInventoryReservation(tx, storefront, reason);
      const notes = appendPaymentMeta(release.notes, { checkout_cancelled: true, checkout_cancel_reason: reason });
      const [updated] = await tx.update(storefrontOrders).set({ paymentStatus: "CANCELLED", fulfillmentStatus: "Cancelled", notes })
        .where(eq(storefrontOrders.id, storefront.id)).returning();
      const [core] = await tx.select().from(orders).where(eq(orders.orderNumber, orderRef)).limit(1);
      if (core) {
        await tx.update(orders).set({
          paymentStatus: "CANCELLED",
          fulfillmentStatus: "Cancelled",
          aiDecisionLog: `${core.aiDecisionLog}; checkout_cancelled=true; inventory_released=${release.released}.`,
        }).where(eq(orders.id, core.id));
        await tx.insert(aiActivityLogs).values({
          userId: core.userId,
          agentName: "Storefront Order Gateway",
          actionType: "CHECKOUT_CANCELLED",
          message: `${orderRef}: checkout cancelled; inventory_released=${release.released}.`,
          profitImpactInr: "0.00",
          metadataJson: { orderRef, inventoryReleased: release.released, reason },
          status: "SUCCESS",
        });
      }
      return NextResponse.json({
        cancelled: true,
        orderRef,
        inventoryReleased: release.released,
        stockCount: release.stockCount,
        paymentStatus: updated?.paymentStatus || "CANCELLED",
        fulfillmentStatus: updated?.fulfillmentStatus || "Cancelled",
      }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid JSON request" : "Unable to cancel order safely" }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}
