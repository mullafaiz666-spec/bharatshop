import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ActionName = "ceo-cycle" | "company-cycle" | "google-refresh" | "catalog-repair" | "product-research" | "fashion-capsule" | "fashion-trends" | "fashion-fronts" | "fashion-backs" | "learning-review" | "marketing-verify" | "payment-status";

type ActionSpec = {
  label: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs: number;
};

const ACTIONS: Record<ActionName, ActionSpec> = {
  "ceo-cycle": { label: "CEO operating cycle", path: "/api/automation/ceo-cycle?skipResearch=1", method: "POST", body: {}, timeoutMs: 150_000 },
  "company-cycle": { label: "Advance shared AI company queue", path: "/api/automation/company-cycle?limit=1", method: "POST", body: {}, timeoutMs: 220_000 },
  "google-refresh": { label: "Google market intelligence refresh", path: "/api/automation/google-intelligence", method: "POST", body: { force: true }, timeoutMs: 70_000 },
  "catalog-repair": { label: "Catalog verification and media repair", path: "/api/automation/catalog-maintenance", method: "POST", body: { limit: 6 }, timeoutMs: 180_000 },
  "product-research": { label: "Product research cycle", path: "/api/automation/research-products", method: "POST", body: { userId: 1, limit: 6 }, timeoutMs: 180_000 },
  "fashion-capsule": { label: "Generate 12 CEO-pending fashion products", path: "/api/fashion-designer", method: "POST", body: { count: 12 }, timeoutMs: 285_000 },
  "fashion-trends": { label: "Refresh Fashion Trend Intelligence", path: "/api/automation/fashion-trend-intelligence", method: "POST", body: {}, timeoutMs: 120_000 },
  "fashion-fronts": { label: "BharatDrip real-human front photo generation", path: "/api/automation/fashion-photo-studio", method: "POST", body: { views: [0], productLimit: 6, externalAttemptLimit: 6 }, timeoutMs: 285_000 },
  "fashion-backs": { label: "BharatDrip real-human back photo generation", path: "/api/automation/fashion-photo-studio", method: "POST", body: { views: [2], productLimit: 4, externalAttemptLimit: 4 }, timeoutMs: 285_000 },
  "learning-review": { label: "Learning and evidence review", path: "/api/agents/learning?userId=1", method: "GET", timeoutMs: 40_000 },
  "marketing-verify": { label: "Meta / Google marketing connection verification", path: "/api/agents/advertising-status?verify=1", method: "GET", timeoutMs: 40_000 },
  "payment-status": { label: "Razorpay / Cashfree configuration check", path: "/api/payments/status", method: "GET", timeoutMs: 20_000 },
};

function token() {
  return String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
}

async function internalCall(origin: string, spec: ActionSpec) {
  const automationToken = token();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (spec.method === "POST") headers["Content-Type"] = "application/json";
  if (automationToken) {
    headers.Authorization = `Bearer ${automationToken}`;
    headers["x-automation-token"] = automationToken;
  }
  const response = await fetch(`${origin}${spec.path}`, {
    method: spec.method,
    headers,
    ...(spec.method === "POST" ? { body: JSON.stringify(spec.body || {}) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(spec.timeoutMs),
  });
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 3000) }; }
  return { ok: response.ok, httpStatus: response.status, data };
}

function serviceStatus(value: any) {
  if (value?.error) return "ERROR";
  if (typeof value?.productionReady === "boolean") {
    if (value.productionReady) return "READY";
    return value.anyConfigured ? "PARTIAL" : "BLOCKED";
  }
  if (typeof value?.anyConnected === "boolean") {
    if (value.anyConnected) return "READY";
    return value.anyConfigured ? "PARTIAL" : "BLOCKED";
  }
  if (value?.summary && typeof value.summary === "object" && typeof value.summary.blocked !== "undefined") {
    const blocked = Array.isArray(value.summary.blocked) ? value.summary.blocked.length : Number(value.summary.blocked || 0);
    return blocked > 0 ? "PARTIAL" : "READY";
  }
  return value?.status || "READY";
}

function compactService(value: any) {
  if (!value || typeof value !== "object") return { status: "UNKNOWN" };
  return {
    status: serviceStatus(value),
    provider: value.provider,
    styleVersion: value.styleVersion,
    photorealCurrentShots: value.photorealCurrentShots,
    cachedProducts: value.cachedProducts,
    sharedWithAllAgents: value.sharedWithAllAgents,
    evidenceCount: Array.isArray(value.evidence) ? value.evidence.length : undefined,
    anyConnected: value.anyConnected,
    anyConfigured: value.anyConfigured,
    productionReady: value.productionReady,
    providers: value.providers,
    channels: value.channels,
    summary: value.summary,
    freeInfrastructure: value.freeInfrastructure,
    error: value.error,
  };
}

export async function GET(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = new URL(req.url).origin;
  const automationToken = token();
  const headers: Record<string, string> = {};
  if (automationToken) {
    headers.Authorization = `Bearer ${automationToken}`;
    headers["x-automation-token"] = automationToken;
  }
  async function safeGet(path: string, timeoutMs = 25_000) {
    try {
      const r = await fetch(`${origin}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      return await r.json().catch(() => ({ status: r.ok ? "READY" : "ERROR", httpStatus: r.status }));
    } catch (error) {
      return { status: "ERROR", error: error instanceof Error ? error.message : String(error) };
    }
  }
  const [fashion, fashionTrends, google, research, learning, agentSuite, agentHealth, advertising, payments] = await Promise.all([
    safeGet("/api/automation/fashion-photo-studio"),
    safeGet("/api/automation/fashion-trend-intelligence"),
    safeGet("/api/automation/google-intelligence"),
    safeGet("/api/automation/research-products"),
    safeGet("/api/agents/learning?userId=1", 35_000),
    safeGet("/api/agents"),
    safeGet("/api/agents/health"),
    safeGet("/api/agents/advertising-status?verify=1", 40_000),
    safeGet("/api/payments/status"),
  ]);
  return NextResponse.json({
    status: "READY",
    operator: { id: admin.id, name: admin.name, role: admin.role },
    automationConfigured: Boolean(automationToken),
    services: {
      fashionStudio: compactService(fashion),
      fashionTrendIntelligence: compactService(fashionTrends),
      googleIntelligence: compactService(google),
      productResearch: compactService(research),
      learningAgent: compactService(learning),
      agentHealth: compactService(agentHealth),
      advertisingConnections: compactService(advertising),
      payments: compactService(payments),
      agentSuite: { status: agentSuite?.suite ? "READY" : agentSuite?.status || "UNKNOWN", suite: agentSuite?.suite, promptVersion: agentSuite?.promptVersion, operationalAgents: Array.isArray(agentSuite?.operationalAgents) ? agentSuite.operationalAgents.length : 0 },
    },
    actions: Object.entries(ACTIONS).map(([id, spec]) => ({ id, label: spec.label })),
    policy: "Command Centre only invokes existing evidence-gated workflows and the bounded shared company work queue. Fashion generation creates CEO-pending records only. Paid ad activation, supplier purchases/payments, refunds/payouts, credentials and destructive database actions are not exposed here.",
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "") as ActionName;
  const spec = ACTIONS[action];
  if (!spec) return NextResponse.json({ error: "Unknown command-centre action" }, { status: 400 });
  const readOnly = action === "learning-review" || action === "marketing-verify" || action === "payment-status";
  if (!token() && !readOnly) return NextResponse.json({ error: "Automation token is not configured on the server" }, { status: 503 });
  try {
    const origin = new URL(req.url).origin;
    const result = await internalCall(origin, spec);
    return NextResponse.json({
      action,
      label: spec.label,
      executedBy: { id: admin.id, name: admin.name, role: admin.role },
      executedAt: new Date().toISOString(),
      ...result,
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ action, label: spec.label, ok: false, error: error instanceof Error ? error.message : "Command failed" }, { status: 503 });
  }
}
