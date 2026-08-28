import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AdPlan = {
  productId: number;
  productName: string;
  channels: string[];
  dailyBudgetInr: number;
  maxCpaInr: number;
  targetRoas: number;
  status: "draft" | "ready";
  rules: { pauseBelowRoas: number; scaleAboveRoas: number; maxDailyBudgetInr: number };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productId = Number(body.productId);
    const productName = String(body.productName || "").trim();
    const sellingPrice = Number(body.sellingPriceInr);
    const landedCost = Number(body.landedCostInr);
    const fees = Number(body.feesInr || 0);
    const marketingAllocation = Number(body.marketingAllocationInr || 0);
    const dailyBudget = Math.max(0, Number(body.dailyBudgetInr || 0));
    if (!Number.isInteger(productId) || !productName || !Number.isFinite(sellingPrice) || !Number.isFinite(landedCost)) {
      return NextResponse.json({ error: "productId, productName, sellingPriceInr and landedCostInr are required" }, { status: 400 });
    }
    const contribution = sellingPrice - landedCost - fees;
    if (contribution <= 0) return NextResponse.json({ error: "Product is not profitable before advertising; advertisement plan blocked." }, { status: 422 });
    const maxCpa = Math.max(1, contribution - marketingAllocation);
    const targetRoas = Math.max(1.5, sellingPrice / maxCpa);
    const plan: AdPlan = {
      productId, productName,
      channels: ["google", "meta"],
      dailyBudgetInr: Math.min(dailyBudget || Math.floor(maxCpa * 2), Number(body.maxDailyBudgetInr || Math.max(maxCpa * 3, 300))),
      maxCpaInr: Math.floor(maxCpa), targetRoas: Number(targetRoas.toFixed(2)), status: "ready",
      rules: { pauseBelowRoas: Number(body.pauseBelowRoas || 1.5), scaleAboveRoas: Number(body.scaleAboveRoas || 3), maxDailyBudgetInr: Number(body.maxDailyBudgetInr || Math.max(maxCpa * 3, 300)) },
    };
    return NextResponse.json({ plan, execution: "approval_required", message: "Plan is ready. External ad accounts must be connected before campaigns can be created or spend can begin." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ agent: "advertisement", status: "ready", channels: ["google", "meta"], capabilities: ["budget_guard", "max_cpa", "roas_pause", "roas_scale", "campaign_planning"], execution: "approval_required" });
}
