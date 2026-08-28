import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = Number(body.orderId);
    const supplierOrderNumber = String(body.supplierOrderNumber ?? "").trim();
    const trackingCode = String(body.trackingCode ?? "").trim();
    if (!orderId || !supplierOrderNumber) return NextResponse.json({ error: "orderId and supplierOrderNumber are required" }, { status: 400 });
    const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const [updated] = await db.update(orders).set({ fulfillmentStatus: trackingCode ? "PURCHASED_TRACKING_ADDED" : "PURCHASED", supplierTrackingCode: trackingCode || supplierOrderNumber, aiDecisionLog: `${current.aiDecisionLog}; manual_purchase_confirmed=true; supplier_order=${supplierOrderNumber}` }).where(eq(orders.id, orderId)).returning();
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Order-Agent // Manual Purchase Queue", actionType: "SUPPLIER_PURCHASE_CONFIRMED", message: `Operator confirmed supplier purchase for ${updated.orderNumber}. Supplier order ${supplierOrderNumber}.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ order: updated, next: "TRACKING_MONITOR" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); }
}
