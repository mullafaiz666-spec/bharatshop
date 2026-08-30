import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, aiActivityLogs } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { eq } from "drizzle-orm";

/**
 * The business workflow is operator-purchase based: after a customer order,
 * the agent re-checks the source cart price/stock and puts the buyer into the
 * purchase queue. This endpoint must never silently place a CJ order because
 * CJ is not the approved source for this workflow.
 */
export async function POST() {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const pending = await db.select().from(orders).where(eq(orders.userId, userId));
    const ready = pending.filter(o => ["RECHECK_REQUIRED", "PURCHASE_PENDING"].includes(o.fulfillmentStatus));
    if (!ready.length) return NextResponse.json({ success: true, fulfilledCount: 0, message: "No orders are ready for operator purchase." });
    await db.insert(aiActivityLogs).values(ready.map(order => ({
      userId,
      agentName: "Order-Agent // Manual Purchase Queue",
      actionType: "PURCHASE_QUEUE_READY",
      message: `${order.orderNumber} is ready for source re-check/operator purchase; no automatic CJ order was placed.`,
      profitImpactInr: order.netProfitInr,
      status: "INFO",
    })));
    return NextResponse.json({ success: true, fulfilledCount: 0, queuedCount: ready.length, orders: ready, workflow: "Customer order → payment gate → source re-check → operator purchase → tracking" });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Purchase queue preparation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
