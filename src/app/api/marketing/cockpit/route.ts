import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiActivityLogs, marketingCampaigns, orders, products } from "@/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { marketingConnections } from "@/lib/marketing/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_AGENT = "Marketing-Cockpit";
const STATE_ACTION = "COCKPIT_STATE";
const MAX_STATE_BYTES = 700_000;

function emptyWorkspace() {
  return {
    version: 2,
    calendar: [],
    library: [],
    routines: [],
    pillarScores: {},
    reviewNotes: {},
    agentRuns: [],
  };
}

function normalizedWorkspace(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyWorkspace();
  const raw = value as Record<string, unknown>;
  return {
    ...emptyWorkspace(),
    ...raw,
    version: 2,
    calendar: Array.isArray(raw.calendar) ? raw.calendar : [],
    library: Array.isArray(raw.library) ? raw.library : [],
    routines: Array.isArray(raw.routines) ? raw.routines : [],
    pillarScores: raw.pillarScores && typeof raw.pillarScores === "object" && !Array.isArray(raw.pillarScores) ? raw.pillarScores : {},
    reviewNotes: raw.reviewNotes && typeof raw.reviewNotes === "object" && !Array.isArray(raw.reviewNotes) ? raw.reviewNotes : {},
    agentRuns: Array.isArray(raw.agentRuns) ? raw.agentRuns.slice(0, 20) : [],
  };
}

async function stateRow(userId: number) {
  const rows = await db.select({ id: aiActivityLogs.id, metadataJson: aiActivityLogs.metadataJson })
    .from(aiActivityLogs)
    .where(and(eq(aiActivityLogs.userId, userId), eq(aiActivityLogs.agentName, STATE_AGENT), eq(aiActivityLogs.actionType, STATE_ACTION)))
    .orderBy(desc(aiActivityLogs.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [saved, campaignRows, productRows, orderRows, recentActivity] = await Promise.all([
      stateRow(admin.id),
      db.select().from(marketingCampaigns).where(eq(marketingCampaigns.userId, admin.id)).orderBy(desc(marketingCampaigns.id)).limit(120),
      db.select({
        id: products.id,
        title: products.title,
        imageUrl: products.imageUrl,
        category: products.category,
        sellingPriceInr: products.sellingPriceInr,
        netProfitInr: products.netProfitInr,
        stockCount: products.stockCount,
        aiMarketingCopy: products.aiMarketingCopy,
        aiTargetAudience: products.aiTargetAudience,
        status: products.status,
      }).from(products).where(eq(products.userId, admin.id)).orderBy(desc(products.id)).limit(150),
      db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        productTitle: orders.productTitle,
        quantity: orders.quantity,
        customerPaidInr: orders.customerPaidInr,
        netProfitInr: orders.netProfitInr,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        orderedAt: orders.orderedAt,
      }).from(orders).where(eq(orders.userId, admin.id)).orderBy(desc(orders.orderedAt)).limit(100),
      db.select({
        id: aiActivityLogs.id,
        agentName: aiActivityLogs.agentName,
        actionType: aiActivityLogs.actionType,
        message: aiActivityLogs.message,
        status: aiActivityLogs.status,
        createdAt: aiActivityLogs.createdAt,
      }).from(aiActivityLogs)
        .where(and(eq(aiActivityLogs.userId, admin.id), eq(aiActivityLogs.agentName, "Creative-Ads-Agent")))
        .orderBy(desc(aiActivityLogs.id)).limit(20),
    ]);

    const workspace = normalizedWorkspace(saved?.metadataJson);
    const connections = marketingConnections();

    const campaignTotals = campaignRows.reduce((acc, campaign) => {
      acc.impressions += Number(campaign.impressions || 0);
      acc.clicks += Number(campaign.clicks || 0);
      acc.conversions += Number(campaign.conversions || 0);
      acc.revenue += Number(campaign.revenueGeneratedInr || 0);
      return acc;
    }, { impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

    const orderTotals = orderRows.reduce((acc, order) => {
      acc.revenue += Number(order.customerPaidInr || 0);
      acc.profit += Number(order.netProfitInr || 0);
      acc.orders += 1;
      return acc;
    }, { revenue: 0, profit: 0, orders: 0 });

    return NextResponse.json({
      workspace,
      campaigns: campaignRows,
      products: productRows,
      orders: orderRows,
      activity: recentActivity,
      connections,
      summary: {
        campaignCount: campaignRows.length,
        productCount: productRows.length,
        orderCount: orderTotals.orders,
        orderRevenueInr: orderTotals.revenue,
        orderProfitInr: orderTotals.profit,
        ...campaignTotals,
      },
      safety: {
        paidSpendEnabled: false,
        externalCampaignCreation: "PAUSED_ONLY",
        activation: "EXPLICIT_OWNER_APPROVAL_REQUIRED",
      },
      serverTime: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketing cockpit unavailable" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { workspace?: unknown };
    const workspace = normalizedWorkspace(body.workspace);
    const serialized = JSON.stringify(workspace);
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) return NextResponse.json({ error: "Cockpit workspace is too large" }, { status: 413 });

    const existing = await stateRow(admin.id);
    if (existing) {
      await db.update(aiActivityLogs).set({
        metadataJson: workspace,
        message: "Marketing Agent cockpit workspace synchronized.",
        status: "SUCCESS",
      }).where(eq(aiActivityLogs.id, existing.id));
    } else {
      await db.insert(aiActivityLogs).values({
        userId: admin.id,
        agentName: STATE_AGENT,
        actionType: STATE_ACTION,
        message: "Marketing Agent cockpit workspace initialized.",
        profitImpactInr: "0.00",
        metadataJson: workspace,
        status: "SUCCESS",
      });
    }
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketing workspace save failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const campaignId = Number(body.campaignId);
    if (!Number.isInteger(campaignId) || campaignId <= 0) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });

    const rows = await db.select().from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.userId, admin.id))).limit(1);
    const campaign = rows[0];
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    if (action === "archiveCampaign") {
      await db.update(marketingCampaigns).set({ status: "ARCHIVED" }).where(eq(marketingCampaigns.id, campaign.id));
      return NextResponse.json({ ok: true, status: "ARCHIVED" });
    }
    if (action === "restoreCampaign") {
      await db.update(marketingCampaigns).set({ status: "READY_FOR_CONNECTOR" }).where(eq(marketingCampaigns.id, campaign.id));
      return NextResponse.json({ ok: true, status: "READY_FOR_CONNECTOR" });
    }
    if (action === "updateCampaign") {
      const headline = String(body.headline ?? campaign.headline).trim().slice(0, 240);
      const bodyText = String(body.bodyText ?? campaign.bodyText).trim().slice(0, 4000);
      const ctaText = String(body.ctaText ?? campaign.ctaText).trim().slice(0, 120);
      const targetAudience = String(body.targetAudience ?? campaign.targetAudience).trim().slice(0, 1000);
      const budget = Number(body.budgetInr ?? campaign.budgetInr);
      const scheduledText = String(body.scheduledAt || "").trim();
      const scheduledAt = scheduledText ? new Date(scheduledText) : null;
      if (!headline || !bodyText || !targetAudience || !Number.isFinite(budget) || budget < 0) return NextResponse.json({ error: "Invalid campaign update" }, { status: 400 });
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Invalid schedule date" }, { status: 400 });
      await db.update(marketingCampaigns).set({ headline, bodyText, ctaText, targetAudience, budgetInr: String(budget), scheduledAt }).where(eq(marketingCampaigns.id, campaign.id));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign update failed" }, { status: 500 });
  }
}
