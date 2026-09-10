import { NextResponse } from "next/server";
import { claimQueuedWork, companySnapshot } from "@/lib/agents/company-state";
import { executeCompanyWorkItem } from "@/lib/agents/company-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

function automationToken() {
  return String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
}

function authorized(request: Request) {
  const expected = automationToken();
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-automation-token") || "";
  return supplied === expected;
}

async function runCycle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 1);
    const limit = Math.max(1, Math.min(2, Number.isFinite(requestedLimit) ? requestedLimit : 1));
    const claimed = await claimQueuedWork(limit);
    const results = [];
    for (const item of claimed) results.push(await executeCompanyWorkItem(item, url.origin));
    const snapshot = await companySnapshot();
    return NextResponse.json({
      status: "COMPLETED",
      architecture: "shared-postgres-work-bus",
      claimed: claimed.length,
      results,
      queue: snapshot.workCounts,
      rule: "Only queued internal agent work is processed. Paid spend, supplier purchase/payment, refunds/payouts, credentials and destructive database actions remain approval-gated elsewhere.",
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company cycle failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return runCycle(request);
}

export async function GET(request: Request) {
  return runCycle(request);
}
