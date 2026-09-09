import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";
import { agentPrompt } from "@/lib/agents/contracts";
import { GOOGLE_INTELLIGENCE_POLICY, loadSharedAgentKnowledge } from "@/lib/agents/live-intelligence";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-automation-token") || "";
  return supplied === expected;
}

function number(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const allProducts = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(200);
    const evidence = await loadSharedAgentKnowledge(20, "India ecommerce fashion streetwear sourcing pricing conversion COD RTO advertising demand");
    const snapshot = allProducts.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      brand: p.brand,
      status: p.status,
      sellingPriceInr: number(p.sellingPriceInr),
      supplierCostInr: number(p.supplierCostInr),
      shippingCostInr: number(p.shippingCostInr),
      gstPct: number(p.gstPct),
      netProfitInr: number(p.netProfitInr),
      customMarginPct: number(p.customMarginPct),
      stockCount: number(p.stockCount),
      salesCount24h: number(p.salesCount24h),
      aiScore: number(p.aiScore),
      updatedAt: p.updatedAt,
    }));

    let review: Record<string, unknown> | null = null;
    let modelError = "";
    try {
      review = await openAIJson(agentPrompt("ceo"), {
        objective: "Daily evidence-driven BharatShop operating review",
        rules: [
          "Do not invent or simulate price, stock, sales, demand, campaign, revenue or conversion metrics.",
          "Treat persisted catalog fields as internal observations, not proof that a supplier or market fact is live unless a specialist verification route confirms it.",
          "Use Google evidence only for market context and prioritization.",
          "Recommend concrete next specialist-agent checks; do not claim external actions occurred.",
        ],
        catalogSnapshot: snapshot,
        externalMarketEvidence: evidence,
        externalEvidencePolicy: GOOGLE_INTELLIGENCE_POLICY,
      }, { timeoutMs: 12_000, maxTokens: 1400 });
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
    }

    const published = snapshot.filter((p) => p.status === "Published").length;
    const staged = snapshot.filter((p) => p.status !== "Published").length;
    const evidenceHashes = evidence.map((x: any) => x.evidenceHash).filter(Boolean).slice(0, 20);
    await db.insert(aiActivityLogs).values({
      userId: 1,
      agentName: "CEO Daily Evidence Review",
      actionType: "EVIDENCE_DAILY_REVIEW",
      message: `Evidence-only daily review completed for ${snapshot.length} catalog records using ${evidence.length} recent public market evidence items. No product, stock, price, sales or campaign metrics were simulated or mutated.`,
      profitImpactInr: "0.00",
      metadataJson: { published, staged, evidenceHashes, review, modelError: modelError || undefined, mutationsApplied: 0, campaignsLaunched: 0 },
      status: modelError ? "WARNING" : "SUCCESS",
    });

    return NextResponse.json({
      success: true,
      status: modelError ? "REVIEW_READY_WITH_MODEL_WARNING" : "REVIEW_READY",
      reviewedProducts: snapshot.length,
      published,
      staged,
      googleEvidenceItems: evidence.length,
      googleEvidenceHashes: evidenceHashes,
      review,
      modelError: modelError || undefined,
      mutationsApplied: 0,
      campaignsLaunched: 0,
      policy: "Evidence-only. This endpoint no longer fabricates daily price/stock/sales changes, fake campaign performance, or automatic LIVE campaigns. Specialist routes must verify live facts before any consequential action.",
      reviewedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evidence daily review failed" }, { status: 503 });
  }
}

export async function GET() {
  const recent = await db.select().from(aiActivityLogs).where(eq(aiActivityLogs.actionType, "EVIDENCE_DAILY_REVIEW")).orderBy(desc(aiActivityLogs.createdAt)).limit(10);
  return NextResponse.json({
    status: "EVIDENCE_ONLY",
    refreshLogs: recent,
    legacySimulationDisabled: true,
    rule: "Daily review is now read/analyze/audit only; live source verification is required before operational price, stock, sourcing or campaign changes.",
  });
}
