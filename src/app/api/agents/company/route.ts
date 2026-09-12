import { deferCompanyExecution } from "@/lib/agents/execution-mode";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { AGENT_CONTRACTS, publicAgentContracts, type OperationalAgentId } from "@/lib/agents/contracts";
import {
  claimQueuedWork,
  companySnapshot,
  createCompanyGoal,
  queueAgentWork,
  recordSharedEvent,
  startWorkItem,
} from "@/lib/agents/company-state";
import { createGrowthCycle, executeCompanyWorkItem, growthWorkCatalog } from "@/lib/agents/company-runtime";
import { listPendingApprovals } from "@/lib/ai/ceo-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAgentId(value: string): value is OperationalAgentId {
  return Object.prototype.hasOwnProperty.call(AGENT_CONTRACTS, value);
}

async function snapshotWithMetadata() {
  const snapshot = await companySnapshot();
  let approvals: unknown[] = [];
  try {
    const pending = await listPendingApprovals();
    approvals = Array.isArray(pending) ? pending : Array.isArray((pending as any)?.approvals) ? (pending as any).approvals : [];
  } catch {
    approvals = [];
  }
  return {
    ...snapshot,
    agents: publicAgentContracts(),
    growthWorkCatalog: growthWorkCatalog().map(({ instruction: _instruction, ...item }) => item),
    pendingApprovals: approvals,
    policy: {
      sourceOfTruth: "Production PostgreSQL",
      evidenceRule: "Missing evidence means HOLD, never guess.",
      approvalGates: ["paid spend", "supplier purchase/payment", "refunds/payouts", "credentials/secrets", "destructive database actions"],
      sharedData: "Agent work outputs are persisted to the company work/event bus and become context for later specialist runs.",
    },
  };
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({
      status: "READY",
      operator: { id: admin.id, name: admin.name, role: admin.role },
      ...(await snapshotWithMetadata()),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company agent state unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "run_agent").trim();
    const origin = new URL(request.url).origin;

    if (action === "create_goal") {
      const objective = String(body.objective || "").trim();
      if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });
      const goal = await createCompanyGoal({
        title: String(body.title || "BharatShop company objective"),
        objective,
        createdBy: admin.id,
        priority: Number(body.priority || 75),
      });
      await recordSharedEvent({
        goalId: goal.id,
        agentId: "ceo",
        eventType: "COMPANY_GOAL_CREATED",
        status: "READY",
        summary: `New company objective created by ${admin.name}: ${goal.title}`,
        evidence: { operatorId: admin.id },
      });
      return NextResponse.json({ ok: true, action, goal, snapshot: await snapshotWithMetadata() }, { status: 201 });
    }

    if (action === "start_growth_cycle") {
      const objective = String(body.objective || "").trim();
      if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });
      const result = await createGrowthCycle({
        objective,
        title: String(body.title || "BharatShop coordinated growth cycle"),
        createdBy: admin.id,
        origin,
      });
      return NextResponse.json({ ok: true, action, ...result, ...(deferCompanyExecution() ? { status: "QUEUED", message: "Growth cycle queued. CEO and specialist results will appear after worker execution." } : {}), snapshot: await snapshotWithMetadata() }, { status: 201 });
    }

    if (action === "run_agent") {
      const agentId = String(body.agentId || body.agent || "").trim();
      const objective = String(body.objective || "").trim();
      if (!isAgentId(agentId)) return NextResponse.json({ error: "Unknown operational agent" }, { status: 400 });
      if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });
      const queued = await queueAgentWork({
        goalId: String(body.goalId || "").trim() || null,
        agentId,
        title: String(body.title || `Direct command for ${AGENT_CONTRACTS[agentId].name}`),
        objective,
        priority: Math.max(1, Math.min(100, Number(body.priority || 85))),
        createdBy: admin.id,
        data: { directCommand: true, operatorId: admin.id },
      });
      if (deferCompanyExecution()) return NextResponse.json({
        ok: true, action, status: "QUEUED", work: queued,
        message: "Task queued. Its result will appear after worker execution.",
        snapshot: await snapshotWithMetadata(),
      }, { status: 202 });
      const work = await startWorkItem(queued.id);
      if (!work) return NextResponse.json({ error: "Work item could not be claimed" }, { status: 409 });
      const result = await executeCompanyWorkItem(work, origin);
      return NextResponse.json({ ok: !result.error, action, work: result.item, runtime: result.result, error: result.error, snapshot: await snapshotWithMetadata() }, { status: result.error ? 503 : 200 });
    }

    if (action === "queue_agent") {
      const agentId = String(body.agentId || body.agent || "").trim();
      const objective = String(body.objective || "").trim();
      if (!isAgentId(agentId)) return NextResponse.json({ error: "Unknown operational agent" }, { status: 400 });
      if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });
      const work = await queueAgentWork({
        goalId: String(body.goalId || "").trim() || null,
        agentId,
        title: String(body.title || `Queued work for ${AGENT_CONTRACTS[agentId].name}`),
        objective,
        priority: Number(body.priority || 60),
        createdBy: admin.id,
        data: { queuedByOperator: admin.id },
      });
      return NextResponse.json({ ok: true, action, work, snapshot: await snapshotWithMetadata() }, { status: 201 });
    }

    if (action === "run_queue") {
      if (deferCompanyExecution()) return NextResponse.json({
        ok: true, action, status: "QUEUED", claimed: 0,
        message: "Queued tasks are waiting for the worker. No tasks were executed by this request.",
        snapshot: await snapshotWithMetadata(),
      }, { status: 202 });
      const claimed = await claimQueuedWork(Math.max(1, Math.min(2, Number(body.limit || 1))));
      const results = [];
      for (const item of claimed) results.push(await executeCompanyWorkItem(item, origin));
      return NextResponse.json({ ok: true, action, claimed: claimed.length, results, snapshot: await snapshotWithMetadata() });
    }

    return NextResponse.json({ error: "Unknown company command-centre action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company command failed" }, { status: 500 });
  }
}
