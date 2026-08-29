import { NextResponse } from "next/server";
import { db, pool } from "@/db";
import { aiActivityLogs, productImages, products, storefrontOrders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_MARGIN_PCT = Number(process.env.CEO_MIN_MARGIN_PCT ?? 25);
const MAX_LISTINGS_PER_CYCLE = 5;
const PLACEHOLDER_HOSTS = ["unsplash.com", "placeholder.com", "placehold.co", "picsum.photos", "dummyimage.com"];

function realUrl(value: unknown) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  const lower = value.toLowerCase();
  return !PLACEHOLDER_HOSTS.some((host) => lower.includes(host));
}

function cronAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET || process.env.AUTOMATION_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

async function ensureCeoTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ceo_approvals (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'PENDING',
    requested_by TEXT NOT NULL DEFAULT 'BHARATSHOP CEO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decision_note TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (
    id SERIAL PRIMARY KEY,
    agent_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'INFO',
    summary TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    approval_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function audit(agent: string, event: string, status: string, summary: string, evidence: unknown, approvalId?: number) {
  await pool.query(
    `INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,approval_id) VALUES($1,$2,$3,$4,$5,$6)`,
    [agent, event, status, summary, JSON.stringify(evidence ?? {}), approvalId ?? null],
  );
}

async function callAgent(origin: string, path: string, body: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 2000) }; }
  return { ok: response.ok, status: response.status, data };
}

async function runCycle(req: Request) {
  await ensureCeoTables();
  const origin = new URL(req.url).origin;
  const startedAt = Date.now();
  const results: any = { research: null, ceo: null, listings: [], orders: null, errors: [] as string[] };

  // Non-CEO agents prepare data. They never receive the final publication decision.
  try {
    results.research = await callAgent(origin, "/api/automation/research-products", { userId: 1, limit: MAX_LISTINGS_PER_CYCLE });
    await audit("AI-Product-Research-Agent", "CYCLE_EXECUTION", results.research.ok ? "SUCCESS" : "WARNING", "Five-minute research cycle completed; candidates remain CEO-gated.", results.research.data);
  } catch (error) {
    results.errors.push(`research: ${error instanceof Error ? error.message : "failed"}`);
  }

  // CEO verification: inspect every candidate's source evidence and unit economics.
  const pending = await db.select().from(products).where(eq(products.status, "CEO_PENDING")).orderBy(desc(products.aiScore)).limit(MAX_LISTINGS_PER_CYCLE);
  const approved: any[] = [];
  const blocked: any[] = [];

  for (const product of pending) {
    const images = await db.select().from(productImages).where(eq(productImages.productId, product.id));
    const verifiedImage = images.find((image) =>
      ["VERIFIED", "WEB_SEARCH_MATCHED", "WEB_IMAGE_EXACT_MATCH"].includes(String(image.verificationStatus)) && realUrl(image.imageUrl) && realUrl(image.sourceUrl),
    );
    const price = Number(product.sellingPriceInr);
    const cost = Number(product.supplierCostInr);
    const shipping = Number(product.shippingCostInr);
    const gst = Number(product.gstPct);
    const landed = cost + shipping + (cost * gst / 100);
    const profit = price - landed;
    const margin = price > 0 ? profit / price * 100 : 0;
    const valid = Boolean(
      product.title.trim() &&
      product.supplierName.trim() &&
      verifiedImage &&
      realUrl(verifiedImage.sourceUrl) &&
      Number(product.stockCount) > 0 &&
      Number.isFinite(price) && price > 0 &&
      Number.isFinite(cost) && cost >= 0 &&
      Number.isFinite(profit) && profit > 0 &&
      margin >= MIN_MARGIN_PCT,
    );

    const evidence = {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      source: product.supplierName,
      sourceUrl: verifiedImage?.sourceUrl || "",
      imageUrl: verifiedImage?.imageUrl || "",
      imageVerificationStatus: verifiedImage?.verificationStatus || "NONE",
      stockCount: product.stockCount,
      supplierCostInr: cost,
      shippingCostInr: shipping,
      gstPct: gst,
      sellingPriceInr: price,
      landedCostInr: Number(landed.toFixed(2)),
      netProfitInr: Number(profit.toFixed(2)),
      marginPct: Number(margin.toFixed(2)),
      minMarginPct: MIN_MARGIN_PCT,
    };

    const [approval] = await db.insert(aiActivityLogs).values({
      userId: product.userId,
      agentName: "CEO-Agent",
      actionType: valid ? "CEO_VERIFIED_PRODUCT" : "CEO_BLOCKED_PRODUCT",
      message: valid ? `CEO verified ${product.title}; releasing it to the listing agent.` : `CEO blocked ${product.title}; verification/economics gate failed.`,
      profitImpactInr: valid ? profit.toFixed(2) : "0.00",
      metadataJson: evidence,
      status: valid ? "SUCCESS" : "WARNING",
    }).returning({ id: aiActivityLogs.id });

    if (valid) {
      await db.update(products).set({ status: "CEO_APPROVED", updatedAt: new Date() }).where(eq(products.id, product.id));
      approved.push({ productId: product.id, auditId: approval.id, marginPct: Number(margin.toFixed(2)) });
    } else {
      await db.update(products).set({ status: "BLOCKED", updatedAt: new Date() }).where(eq(products.id, product.id));
      blocked.push({ productId: product.id, auditId: approval.id });
    }
  }

  results.ceo = { inspected: pending.length, approved: approved.length, blocked: blocked.length, approvedProducts: approved, blockedProducts: blocked };
  await audit("CEO-Agent", "CEO_VERIFICATION_CYCLE", "SUCCESS", `CEO inspected ${pending.length} candidates; ${approved.length} approved and ${blocked.length} blocked.`, results.ceo);

  // Only CEO-approved products reach the listing agent/storefront.
  for (const item of approved) {
    try {
      const listing = await callAgent(origin, "/api/agents/listing", { productId: item.productId, ceoApproved: true });
      results.listings.push({ productId: item.productId, ...listing });
      if (!listing.ok || listing.data?.error) {
        await db.update(products).set({ status: "CEO_APPROVED", updatedAt: new Date() }).where(eq(products.id, item.productId));
      }
      await audit("Listing-Creative-Agent", "CEO_APPROVED_LISTING", listing.ok ? "SUCCESS" : "FAILED", `Listing execution for CEO-approved product ${item.productId}.`, listing.data);
    } catch (error) {
      results.errors.push(`listing:${item.productId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  // The CEO does not make fulfillment decisions on a timer. It only wakes up
  // the order-review path once a real storefront order exists.
  const realOrders = await db.select({ id: storefrontOrders.id, orderRef: storefrontOrders.orderRef, fulfillmentStatus: storefrontOrders.fulfillmentStatus })
    .from(storefrontOrders)
    .orderBy(desc(storefrontOrders.orderedAt))
    .limit(10);
  if (realOrders.length) {
    results.orders = { realOrderCount: realOrders.length, humanInteractionGate: true, orders: realOrders };
    await audit("CEO-Agent", "REAL_ORDER_HUMAN_GATE", "READY", "A real storefront order exists; CEO order review is now eligible. No fulfillment action is taken by the timer alone.", results.orders);
  } else {
    results.orders = { realOrderCount: 0, humanInteractionGate: false };
  }

  results.durationMs = Date.now() - startedAt;
  await db.insert(aiActivityLogs).values({
    userId: 1,
    agentName: "CEO-Agent",
    actionType: "FIVE_MINUTE_CYCLE_COMPLETED",
    message: `CEO cycle completed: ${pending.length} candidates inspected, ${approved.length} approved, ${blocked.length} blocked, ${realOrders.length} real orders present.`,
    profitImpactInr: "0.00",
    metadataJson: results,
    status: results.errors.length ? "WARNING" : "SUCCESS",
  });
  return results;
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ status: "COMPLETED", schedule: "*/5 * * * *", agents24x7: true, ceoException: true, ...(await runCycle(req)) });
  } catch (error) {
    return NextResponse.json({ status: "FAILED", error: error instanceof Error ? error.message : "CEO cycle failed" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
