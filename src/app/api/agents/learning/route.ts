import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = Number(searchParams.get("userId") ?? 1);
  const logs = await db.select().from(aiActivityLogs).where(eq(aiActivityLogs.userId, userId)).orderBy(desc(aiActivityLogs.createdAt)).limit(200);
  const buckets: Record<string, { events: number; profitImpactInr: number }> = {};
  for (const l of logs) {
    const key = l.agentName || "unknown";
    buckets[key] ??= { events: 0, profitImpactInr: 0 };
    buckets[key].events += 1;
    buckets[key].profitImpactInr += Number(l.profitImpactInr || 0);
  }
  return NextResponse.json({ agent: "Learning-Agent", inputs: ["source price changes", "delivery time", "cancellations", "returns/RTO", "profit", "advertising performance"], observations: buckets, recent: logs.slice(0, 30) });
}
