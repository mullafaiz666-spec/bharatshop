import { NextResponse } from "next/server";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";
import { createCompanyGoal, queueAgentWork, recordSharedEvent } from "@/lib/agents/company-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const DAILY_PLAN: Array<{ agentId: OperationalAgentId; title: string; priority: number; objective: string }> = [
  {
    agentId: "source-discovery",
    title: "Daily profitable product opportunity scan",
    priority: 88,
    objective: "Inspect fresh, source-backed market and current catalog evidence. Identify profitable product gaps or sourcing opportunities. Missing supplier, stock, landed-cost or policy evidence means HOLD; never invent facts.",
  },
  {
    agentId: "listing",
    title: "Daily catalog conversion readiness review",
    priority: 82,
    objective: "Review verified catalog items and queue concrete listing, SEO, merchandising or media improvements that can improve conversion without weakening source, image or margin gates.",
  },
  {
    agentId: "marketing",
    title: "Daily organic growth plan",
    priority: 80,
    objective: "Use verified products and current evidence to prepare bounded organic marketing actions. Separate estimates from measured performance. Do not activate paid spend.",
  },
  {
    agentId: "learning",
    title: "Daily company learning review",
    priority: 72,
    objective: "Review persisted operational outcomes and extract evidence-backed lessons for profitability, conversion, sourcing quality, fulfilment, RTO and returns. Do not weaken hard approval gates.",
  },
];

function automationToken() {
  return String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
}

function authorized(request: Request) {
  const expected = automationToken();
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-automation-token") || "";
  return supplied === expected;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const objective = `BharatShop daily growth cycle ${today}: improve profitable, truthful ecommerce growth using current evidence and the shared company database. Keep paid spend, supplier purchase/payment, refunds/payouts, credentials and destructive database actions human-approved.`;
    const goal = await createCompanyGoal({
      title: `BharatShop daily growth cycle ${today}`,
      objective,
      createdBy: null,
      priority: 85,
    });

    const queued = [];
    for (const plan of DAILY_PLAN) {
      queued.push(await queueAgentWork({
        goalId: goal.id,
        agentId: plan.agentId,
        title: plan.title,
        objective: `${objective}\n\nSpecialist assignment: ${plan.objective}`,
        priority: plan.priority,
        createdBy: null,
        data: { scheduledFreeStackCycle: true, scheduledDate: today },
      }));
    }

    await recordSharedEvent({
      goalId: goal.id,
      agentId: "ceo",
      eventType: "FREE_STACK_DAILY_WORK_QUEUED",
      status: "READY",
      summary: `${queued.length} bounded daily specialist tasks were queued for later execution on the shared PostgreSQL work bus.`,
      evidence: {
        scheduledDate: today,
        agents: queued.map((item) => item.agent_id),
        approvalGates: ["paid spend", "supplier purchase/payment", "refunds/payouts", "credentials/secrets", "destructive database actions"],
      },
    });

    return NextResponse.json({
      ok: true,
      status: "QUEUED",
      goal: { id: goal.id, title: goal.title },
      queued: queued.map((item) => ({ id: item.id, agentId: item.agent_id, title: item.title, priority: item.priority })),
      execution: "Deferred to the existing authenticated company-cycle worker/runtime.",
      policy: "This scheduler never activates paid spend, purchases suppliers, moves money, exposes credentials or performs destructive database actions.",
      queuedAt: new Date().toISOString(),
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Free-stack schedule failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "READY",
    mode: "queue-only",
    agents: DAILY_PLAN.map((item) => ({ id: item.agentId, name: AGENT_CONTRACTS[item.agentId].name, title: item.title })),
    rule: "POST requires the automation token. Scheduling queues work only; execution remains in the company agent runtime.",
  });
}
