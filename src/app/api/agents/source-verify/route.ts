import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

type Candidate = {
  sourceId: string;
  sourceName: string;
  title: string;
  sku: string;
  imageUrl: string;
  supplierName: string;
  supplierCostInr: number;
  shippingCostInr: number;
  gstPct: number;
  sellingPriceInr: number;
  stockCount: number;
  sourceVerified: boolean;
};

function calculate(c: Candidate, minMarginPct: number) {
  const landed = c.supplierCostInr + c.shippingCostInr + c.supplierCostInr * c.gstPct / 100;
  const profit = c.sellingPriceInr - landed;
  const margin = c.sellingPriceInr > 0 ? profit / c.sellingPriceInr * 100 : 0;
  const score = c.sourceVerified && c.stockCount > 0 && margin >= minMarginPct
    ? Math.round(Math.min(100, margin + Math.min(c.stockCount / 100, 20)))
    : 0;
  return { landedCostInr: Number(landed.toFixed(2)), netProfitInr: Number(profit.toFixed(2)), marginPct: Number(margin.toFixed(2)), selectionScore: score };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const candidates: Candidate[] = Array.isArray(body.candidates) ? body.candidates : [];
    const minMarginPct = Number(body.minMarginPct ?? 35);
    if (!candidates.length) return NextResponse.json({ error: "No source candidates supplied. Connect an authorized source/API/feed first." }, { status: 400 });

    const evaluated = candidates.map((candidate) => ({ ...candidate, economics: calculate(candidate, minMarginPct) }));
    const selected = evaluated.filter(x => x.economics.selectionScore > 0).sort((a, b) => b.economics.selectionScore - a.economics.selectionScore);

    if (selected.length) {
      await db.insert(aiActivityLogs).values({
        userId: Number(body.userId ?? 1),
        agentName: "Verify-Select-AI",
        actionType: "SOURCE_VERIFIED_AND_SELECTED",
        message: `Evaluated ${evaluated.length} source candidates; selected ${selected[0].title} at ${selected[0].economics.marginPct}% margin.`,
        profitImpactInr: selected[0].economics.netProfitInr.toFixed(2),
        status: "SUCCESS",
      });
    }

    return NextResponse.json({
      pipeline: "Source → Verify → Calculate → Select",
      candidates: evaluated,
      selected: selected[0] ?? null,
      status: selected.length ? "READY_FOR_LISTING" : "NO_QUALIFIED_PRODUCT",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ agent: "Verify-Select-AI", status: "ready", requiresAuthorizedSourceData: true });
}
