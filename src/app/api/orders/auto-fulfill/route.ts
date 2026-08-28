import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, aiActivityLogs } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { eq } from "drizzle-orm";
import { canPlaceAutomatedOrder } from "@/lib/suppliers/supplier-router";
import { createCjOrder } from "@/lib/suppliers/cj";

export async function POST() {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const allOrders = await db.select().from(orders);
    const pending = allOrders.filter(o => ["Incoming", "AI Checking"].includes(o.fulfillmentStatus));
    if (!pending.length) return NextResponse.json({ fulfilledCount: 0, message: "No pending orders." });

    if (!canPlaceAutomatedOrder("cj")) {
      return NextResponse.json({ success: false, blocked: true, error: "No authorized live supplier ordering integration is enabled. Configure CJ credentials and enable live fulfillment only after end-to-end verification." }, { status: 409 });
    }

    const updated = [];
    for (const order of pending) {
      if (!order.productId) continue;
      const result = await createCjOrder({
        orderNumber: order.orderNumber,
        shippingName: order.customerName,
        phone: order.customerPhone,
        address: "",
        city: order.customerCity,
        state: order.customerState,
        pincode: order.customerPincode,
        productId: String(order.productId),
        quantity: order.quantity,
      });
      const supplierOrderId = result?.data?.orderId || result?.data?.orderNumber || null;
      const [upd] = await db.update(orders).set({
        fulfillmentStatus: "Supplier Ordered",
        aiDecisionLog: `Authorized supplier order submitted. Supplier reference: ${supplierOrderId || "pending"}.`,
      }).where(eq(orders.id, order.id)).returning();
      updated.push(upd);
      await db.insert(aiActivityLogs).values({ userId, agentName: "Zero-Touch Core // Supplier Fulfillment", actionType: "SUPPLIER_ORDER_CREATED", message: `${order.orderNumber}: supplier order ${supplierOrderId || "created"}`, profitImpactInr: order.netProfitInr, status: "SUCCESS" });
    }

    return NextResponse.json({ success: true, fulfilledCount: updated.length, orders: updated, message: `Submitted ${updated.length} authorized supplier order(s).` });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Supplier fulfillment failed" }, { status: 500 });
  }
}
