import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

type Source = { name: string; url?: string; cartPriceInr: number; shippingInr: number; stock: number; deliveryDays?: number; eligible?: boolean };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sources: Source[] = Array.isArray(body.sources) ? body.sources : [];
    const sellingPrice = Number(body.sellingPriceInr || 0);
    const minMargin = Number(body.minMarginPct ?? 35);
    if (!sources.length || !sellingPrice) return NextResponse.json({ error: "sources and sellingPriceInr are required" }, { status: 400 });
    const evaluated = sources.map(s => {
      const landed = s.cartPriceInr + s.shippingInr;
      const profit = sellingPrice - landed;
      const margin = sellingPrice ? profit / sellingPrice * 100 : 0;
      const eligible = s.eligible !== false && s.stock > 0 && margin >= minMargin;
      return { ...s, landedCostInr: +landed.toFixed(2), profitInr: +profit.toFixed(2), marginPct: +margin.toFixed(2), eligible };
    }).sort((a,b) => Number(b.eligible)-Number(a.eligible) || b.marginPct-a.marginPct || (a.deliveryDays ?? 999)-(b.deliveryDays ?? 999));
    const selected = evaluated.find(x => x.eligible) ?? null;
    await db.insert(aiActivityLogs).values({ userId: Number(body.userId ?? 1), agentName: "Source-Discovery-Agent", actionType: "MULTI_SOURCE_EVALUATION", message: `Evaluated ${evaluated.length} eligible-store candidates using customer/cart prices; selected ${selected?.name ?? "none"}.`, profitImpactInr: String(selected?.profitInr ?? 0), metadataJson: { evaluated, selected }, status: "SUCCESS" });
    return NextResponse.json({ evaluated, selected, status: selected ? "SOURCE_SELECTED" : "NO_QUALIFIED_SOURCE", pricingBasis: "ACTUAL_CUSTOMER_CART_PRICE" });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 }); }
}

export async function GET() { return NextResponse.json({ agent: "Source-Discovery-Agent", status: "ready", pricingBasis: "ACTUAL_CUSTOMER_CART_PRICE", note: "Runtime discovery accepts source/cart observations from authorized stores or feeds; it never substitutes wholesale pricing." }); }
