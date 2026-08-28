import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs, marketingCampaigns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { listProducts, health as cjHealth } from "@/lib/integrations/cj";

export const dynamic = "force-dynamic";

const requiredEnv = ["CJ_ACCESS_TOKEN"] as const;

export async function GET() {
  const cj = await cjHealth();
  const campaigns = await db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)).limit(10);
  const liveProducts = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(10);
  const missing = requiredEnv.filter(k => !process.env[k]);
  return NextResponse.json({
    status: cj.connected ? "SOURCE_CONNECTED" : "SOURCE_CONFIGURATION_REQUIRED",
    source: cj,
    liveProductCount: liveProducts.length,
    recentCampaigns: campaigns.length,
    requiredEnvironment: missing,
    workflow: {
      source: cj.connected,
      verify: true,
      calculate: true,
      select: true,
      listing: true,
      creative: true,
      advertise: campaigns.length > 0,
      order: true,
      recheck: true,
      fulfill: cj.connected,
      track: cj.connected,
      learn: true,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const keyword = String(body.keyword || "");
    const userId = Number(body.userId || 1);
    const minMarginPct = Number(body.minMarginPct || 35);
    const fx = Number(body.usdInr || 90);
    const margin = minMarginPct / 100;

    const candidates = await listProducts(keyword, 1, Math.min(Number(body.size || 20), 100));
    const qualified = candidates.map(p => {
      const cost = p.priceUsd * fx;
      const shipping = Number(body.shippingInr || 120);
      const gst = cost * 0.18;
      const selling = Math.ceil((cost + shipping + gst) / Math.max(0.01, 1 - margin));
      const profit = selling - cost - shipping - gst;
      const marginPct = selling ? profit / selling * 100 : 0;
      return { ...p, supplierCostInr: Number(cost.toFixed(2)), shippingCostInr: shipping, gstPct: 18, sellingPriceInr: selling, netProfitInr: Number(profit.toFixed(2)), marginPct: Number(marginPct.toFixed(2)), verified: p.stock > 0 && !!p.imageUrl && marginPct >= minMarginPct };
    }).filter(p => p.verified).sort((a, b) => b.marginPct - a.marginPct);

    const selected = qualified[0];
    await db.insert(aiActivityLogs).values({ userId, agentName: "Live-Sourcing-Orchestrator", actionType: "SOURCE_SYNC", message: `CJ live source returned ${candidates.length}; ${qualified.length} passed verification/economics${selected ? `; selected ${selected.name}` : ""}.`, profitImpactInr: selected?.netProfitInr?.toFixed(2) || "0.00", status: selected ? "SUCCESS" : "WARNING" });

    return NextResponse.json({ pipeline: "Source → Verify → Calculate → Select", candidates, selected: selected || null, status: selected ? "READY_FOR_LISTING" : "NO_QUALIFIED_PRODUCT" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Live sourcing failed" }, { status: 503 });
  }
}
