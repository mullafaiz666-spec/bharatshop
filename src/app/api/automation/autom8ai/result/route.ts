import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiActivityLogs, products } from "@/db/schema";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WORKFLOWS = new Set(["marketing-video", "fashion-creative"]);
const STATUSES = new Set(["QUEUED", "RENDERING", "COMPLETED", "FAILED", "NEEDS_REVIEW"]);

function tokenAuthorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-automation-token") ||
    "";
  return supplied === expected;
}

async function authorized(req: Request) {
  if (tokenAuthorized(req)) return true;
  try { return Boolean(await getAdminUser()); } catch { return false; }
}

function clean(value: unknown, max = 1200) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function safeHttpsUrl(value: unknown) {
  const raw = clean(value, 2000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeWorkflow(value: unknown) {
  const workflow = clean(value, 40).toLowerCase();
  return WORKFLOWS.has(workflow) ? workflow : null;
}

function normalizeStatus(value: unknown) {
  const status = clean(value, 40).toUpperCase();
  return STATUSES.has(status) ? status : null;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Valid productId is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(aiActivityLogs)
    .where(and(
      eq(aiActivityLogs.actionType, "AUTOM8AI_CREATIVE_RESULT_RECEIVED"),
    ))
    .orderBy(desc(aiActivityLogs.createdAt))
    .limit(50);

  const results = rows
    .filter((row) => Number((row.metadataJson as Record<string, unknown> | null)?.productId) === productId)
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      status: row.status,
      message: row.message,
      metadata: row.metadataJson,
      createdAt: row.createdAt,
    }));

  return NextResponse.json({
    productId,
    results,
    policy: {
      reviewOnly: true,
      productMutation: false,
      autoPublish: false,
      adSpend: false,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Valid productId is required" }, { status: 400 });
  }

  const workflow = normalizeWorkflow(body.workflow);
  if (!workflow) return NextResponse.json({ error: "Valid workflow is required" }, { status: 400 });

  const remoteStatus = normalizeStatus(body.status);
  if (!remoteStatus) return NextResponse.json({ error: "Valid result status is required" }, { status: 400 });

  const assetUrl = safeHttpsUrl(body.assetUrl || body.videoUrl || body.outputUrl);
  const workflowUrl = safeHttpsUrl(body.workflowUrl || body.runUrl);
  const remoteJobId = clean(body.jobId || body.runId || body.id, 200) || null;
  const message = clean(body.message, 1000) || null;
  const renderer = clean(body.renderer, 120) || "external-renderer";

  if (remoteStatus === "COMPLETED" && !assetUrl && !workflowUrl) {
    return NextResponse.json(
      { error: "Completed results require an HTTPS assetUrl or workflowUrl" },
      { status: 422 },
    );
  }

  const [product] = await db.select({
    id: products.id,
    userId: products.userId,
    title: products.title,
  }).from(products).where(eq(products.id, productId)).limit(1);

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await db.insert(aiActivityLogs).values({
    userId: product.userId,
    agentName: "Autom8AI Creative Orchestrator",
    actionType: "AUTOM8AI_CREATIVE_RESULT_RECEIVED",
    message: `Autom8AI ${workflow} result received for ${product.title}: ${remoteStatus}.`,
    metadataJson: {
      productId: product.id,
      workflow,
      remoteStatus,
      remoteJobId,
      renderer,
      assetUrl,
      workflowUrl,
      message,
      safety: {
        reviewOnly: true,
        productMutation: false,
        autoPublish: false,
        adSpend: false,
        createsOrders: false,
        createsPayments: false,
      },
    },
    status: remoteStatus === "FAILED" ? "FAILED" : "SUCCESS",
  });

  return NextResponse.json({
    success: true,
    recorded: true,
    reviewOnly: true,
    productId: product.id,
    workflow,
    remoteStatus,
    remoteJobId,
    assetUrl,
    workflowUrl,
    safety: {
      productMutation: false,
      autoPublish: false,
      adSpend: false,
      createsOrders: false,
      createsPayments: false,
    },
  });
}
