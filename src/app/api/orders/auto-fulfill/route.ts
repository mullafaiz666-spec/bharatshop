import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, aiActivityLogs } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const allOrders = await db.select().from(orders);
    const pending = allOrders.filter(o => ["Incoming", "AI Checking"].includes(o.fulfillmentStatus));

    if (pending.length === 0) {
      return NextResponse.json({ fulfilledCount: 0, totalProfitLockedInr: 0, message: "Sab orders already fulfilled hain." });
    }

    let totalProfit = 0;
    const updated = [];

    for (const order of pending) {
      const tracking = `DELHIVERY${Math.floor(1000000 + Math.random() * 9000000)}`;
      const [upd] = await db.update(orders).set({
        fulfillmentStatus: "Auto-Ordered",
        supplierTrackingCode: tracking,
        carrierName: "Delhivery Surface",
        aiDecisionLog: `AI Auto-Pilot ne ₹${order.supplierCostInr} supplier ko pay kiya. Tracking ${tracking} — ${order.customerCity} ko dispatch.`,
        fulfilledAt: new Date(),
      }).where(eq(orders.id, order.id)).returning();
      updated.push(upd);
      totalProfit += Number(order.netProfitInr || 0);

      await db.insert(aiActivityLogs).values({
        userId,
        agentName: "Zero-Touch Core // Auto-Fulfill",
        actionType: "ORDER_FULFILLED",
        message: `Auto-purchase: ${order.orderNumber} (₹${order.supplierCostInr} cost) | Net Profit locked ₹${order.netProfitInr}`,
        profitImpactInr: order.netProfitInr,
        status: "SUCCESS",
      });
    }

    return NextResponse.json({
      fulfilledCount: updated.length,
      totalProfitLockedInr: Number(totalProfit.toFixed(2)),
      orders: updated,
      message: `Zero-Touch Auto-Fulfillment: ${updated.length} orders Delhivery ko book kar diya!`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
