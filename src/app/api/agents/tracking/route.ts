import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, aiActivityLogs } from "@/db/schema";
import { desc, isNotNull } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  const rows = await db.select().from(orders).where(isNotNull(orders.supplierTrackingCode)).orderBy(desc(orders.orderedAt)).limit(100);
  return NextResponse.json({ agent: "Tracking-Agent", orders: rows.map(o => ({ orderId:o.id, orderNumber:o.orderNumber, supplierOrderOrTracking:o.supplierTrackingCode, carrier:o.carrierName, status:o.fulfillmentStatus, lastUpdated:o.fulfilledAt || o.orderedAt })) });
}
export async function POST(req: Request) {
  const body = await req.json(); const orderId = Number(body.orderId); const tracking = String(body.trackingCode || "").trim();
  if (!orderId || !tracking) return NextResponse.json({error:"orderId and trackingCode required"},{status:400});
  const [updated] = await db.update(orders).set({supplierTrackingCode:tracking, carrierName:body.carrierName ? String(body.carrierName) : undefined, fulfillmentStatus:body.status ? String(body.status) : "PURCHASED_TRACKING_ADDED"}).where((await import("drizzle-orm")).eq(orders.id,orderId)).returning();
  if (!updated) return NextResponse.json({error:"Order not found"},{status:404});
  await db.insert(aiActivityLogs).values({userId:updated.userId,agentName:"Tracking-Agent",actionType:"TRACKING_UPDATED",message:`${updated.orderNumber}: tracking ${tracking} recorded for lifecycle monitoring.`,profitImpactInr:updated.netProfitInr,status:"SUCCESS"});
  return NextResponse.json({order:updated});
}
