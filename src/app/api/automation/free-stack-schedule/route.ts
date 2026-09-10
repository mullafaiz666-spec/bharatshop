import { NextResponse } from "next/server";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";
import { ensureCompanyTables, recordSharedEvent, type AgentWorkItem, type CompanyGoal } from "@/lib/agents/company-state";
import { pool } from "@/db";

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

async function ensureDailyGoal(today: string, objective: string) {
  await ensureCompanyTables();
  const goalId = `free-stack-daily-${today}`;
  const inserted = await pool.query<CompanyGoal>(
    `INSERT INTO agent_company_goals(id,title,objective,status,priority,created_by)
     VALUES($1,$2,$3,'ACTIVE',85,NULL)
     ON CONFLICT(id) DO NOTHING
     RETURNING *`,
    [goalId, `BharatShop daily growth cycle ${today}`, objective],
  );
  if (inserted.rows[0]) return { goal: inserted.rows[0], created: true };
  const existing = await pool.query<CompanyGoal>(`SELECT * FROM agent_company_goals WHERE id=$1 LIMIT 1`, [goalId]);
  if (!existing.rows[0]) throw new Error("Unable to recover idempotent daily goal");
  return { goal: existing.rows[0], created: false };
}

async function ensureDailyWork(goalId: string, today: string, objective: string, plan: (typeof DAILY_PLAN)[number]) {
  const workId = `free-stack-daily-${today}-${plan.agentId}`;
  const input = { scheduledFreeStackCycle: true, scheduledDate: today };
  const inserted = await pool.query<AgentWorkItem>(
    `INSERT INTO agent_work_items(id,goal_id,agent_id,title,objective,status,priority,input,created_by)
     VALUES($1,$2,$3,$4,$5,'QUEUED',$6,$7::jsonb,NULL)
     ON CONFLICT(id) DO NOTHING
     RETURNING *`,
    [
      workId,
      goalId,
      plan.agentId,
      plan.title,
      `${objective}\n\nSpecialist assignment: ${plan.objective}`,
      plan.priority,
      JSON.stringify(input),
    ],
  );
  if (inserted.rows[0]) return { item: inserted.rows[0], created: true };
  const existing = await pool.query<AgentWorkItem>(`SELECT * FROM agent_work_items WHERE id=$1 LIMIT 1`, [workId]);
  if (!existing.rows[0]) throw new Error(`Unable to recover idempotent work item ${workId}`);
  return { item: existing.rows[0], created: false };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const objective = `BharatShop daily growth cycle ${today}: improve profitable, truthful ecommerce growth using current evidence and the shared company database. Keep paid spend, supplier purchase/payment, refunds/payouts, credentials and destructive database actions human-approved.`;
    const goalResult = await ensureDailyGoal(today, objective);

    const ensured = [];
    for (const plan of DAILY_PLAN) {
      ensured.push(await ensureDailyWork(goalResult.goal.id, today, objective, plan));
    }
    const newlyQueued = ensured.filter((entry) => entry.created).map((entry) => entry.item);

    if (newlyQueued.length) {
      await recordSharedEvent({
        goalId: goalResult.goal.id,
        agentId: "ceo",
        eventType: "FREE_STACK_DAILY_WORK_QUEUED",
        status: "READY",
        summary: `${newlyQueued.length} bounded daily specialist task(s) were queued for later execution on the shared PostgreSQL work bus.`,
        evidence: {
          scheduledDate: today,
          agents: newlyQueued.map((item) => item.agent_id),
          approvalGates: ["paid spend", "supplier purchase/payment", "refunds/payouts", "credentials/secrets", "destructive database actions"],
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: newlyQueued.length ? "QUEUED" : "ALREADY_QUEUED",
      idempotent: true,
      goal: { id: goalResult.goal.id, title: goalResult.goal.title, created: goalResult.created },
      queued: ensured.map(({ item, created }) => ({ id: item.id, agentId: item.agent_id, title: item.title, priority: item.priority, created, status: item.status })),
      newlyQueuedCount: newlyQueued.length,
      execution: "Deferred to the existing authenticated company-cycle worker/runtime.",
      policy: "This scheduler never activates paid spend, purchases suppliers, moves money, exposes credentials or performs destructive database actions.",
      queuedAt: new Date().toISOString(),
    }, { status: newlyQueued.length ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Free-stack schedule failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "READY",
    mode: "queue-only",
    idempotent: true,
    agents: DAILY_PLAN.map((item) => ({ id: item.agentId, name: AGENT_CONTRACTS[item.agentId].name, title: item.title })),
    rule: "POST requires the automation token. Scheduling queues at most one work item per configured agent per UTC date; execution remains in the company agent runtime.",
  });
}
