import { NextResponse } from "next/server";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";
import { ensureCompanyTables, recordSharedEvent, type AgentWorkItem, type CompanyGoal } from "@/lib/agents/company-state";
import { pool } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type DailyPlanItem = {
  agentId: OperationalAgentId;
  title: string;
  priority: number;
  objective: string;
  lane: "executive" | "supply" | "catalog" | "growth" | "operations";
};

const DAILY_PLAN: DailyPlanItem[] = [
  {
    agentId: "ceo",
    title: "Daily CEO evidence brief and priorities",
    priority: 100,
    lane: "executive",
    objective: "Review persisted company evidence, queue state, catalog readiness, growth blockers and approval boundaries. Produce a concise evidence-backed operating brief for the specialist team. Missing evidence means HOLD; never invent execution or financial results.",
  },
  {
    agentId: "source-discovery",
    title: "Daily profitable product opportunity scan",
    priority: 94,
    lane: "supply",
    objective: "Inspect fresh, source-backed market and current catalog evidence. Identify profitable product gaps or sourcing opportunities. Missing supplier, stock, landed-cost or policy evidence means HOLD; never invent facts.",
  },
  {
    agentId: "source-verification",
    title: "Daily source and economics verification review",
    priority: 92,
    lane: "supply",
    objective: "Review current source evidence and catalog candidates. Surface products that are READY, HOLD or BLOCKED under live price, stock, shipping, freshness, fulfillment-policy and contribution-margin gates. Do not silently substitute sources.",
  },
  {
    agentId: "seller-discovery",
    title: "Daily direct supplier pipeline expansion",
    priority: 84,
    lane: "supply",
    objective: "Find source-backed independent Indian brands, manufacturers, wholesalers or direct suppliers that could improve landed cost or assortment quality. Never invent phone numbers, email addresses, MOQ or wholesale terms.",
  },
  {
    agentId: "image-media",
    title: "Daily catalog media readiness and repair review",
    priority: 88,
    lane: "catalog",
    objective: "Review product media readiness and prioritize truthful image repairs using verified supplier media or original BharatShop creative. Reject placeholders, broken media and unsupported semantic claims.",
  },
  {
    agentId: "listing",
    title: "Daily catalog conversion readiness review",
    priority: 86,
    lane: "catalog",
    objective: "Review verified catalog items and queue concrete listing, SEO, merchandising or media improvements that can improve conversion without weakening source, image or margin gates.",
  },
  {
    agentId: "marketing",
    title: "Daily organic growth plan",
    priority: 84,
    lane: "growth",
    objective: "Use verified products and current evidence to prepare bounded organic marketing actions for Instagram, Meta-ready creative, Google surfaces and BharatShop-owned channels. Separate estimates from measured performance. Do not activate paid spend.",
  },
  {
    agentId: "advertising",
    title: "Daily paid acquisition readiness review",
    priority: 78,
    lane: "growth",
    objective: "Review contribution economics, tracking readiness and campaign inputs. Recommend only bounded tests whose maximum CPA fits contribution margin. Any external campaign must remain PAUSED until explicit human approval.",
  },
  {
    agentId: "automation",
    title: "Daily workflow optimization review",
    priority: 80,
    lane: "operations",
    objective: "Inspect company operations and recommend bounded, idempotent automation improvements with explicit preconditions, retries, failure paths and audit outputs. Never claim a workflow executed without a receipt.",
  },
  {
    agentId: "web-design",
    title: "Daily storefront conversion and UX review",
    priority: 76,
    lane: "growth",
    objective: "Review mobile storefront and customer journey evidence. Identify high-impact conversion, accessibility, navigation or product-card improvements while preserving checkout, truthful media and backend contracts.",
  },
  {
    agentId: "learning",
    title: "Daily company learning review",
    priority: 74,
    lane: "operations",
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
     VALUES($1,$2,$3,'ACTIVE',92,NULL)
     ON CONFLICT(id) DO NOTHING
     RETURNING *`,
    [goalId, `BharatShop company autopilot ${today}`, objective],
  );
  if (inserted.rows[0]) return { goal: inserted.rows[0], created: true };
  const existing = await pool.query<CompanyGoal>(`SELECT * FROM agent_company_goals WHERE id=$1 LIMIT 1`, [goalId]);
  if (!existing.rows[0]) throw new Error("Unable to recover idempotent daily goal");
  return { goal: existing.rows[0], created: false };
}

async function ensureDailyWork(goalId: string, today: string, objective: string, plan: DailyPlanItem) {
  const workId = `free-stack-daily-${today}-${plan.agentId}`;
  const input = {
    scheduledFreeStackCycle: true,
    companyAutopilotVersion: "v2",
    scheduledDate: today,
    lane: plan.lane,
  };
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
      `${objective}\n\nDepartment assignment: ${plan.objective}\n\nRead shared evidence from higher-priority completed agents before deciding. Return concrete actions or a truthful HOLD/BLOCKED/APPROVAL_REQUIRED state.`,
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
    const objective = `BharatShop company autopilot ${today}: grow profitable, truthful ecommerce operations using current evidence and the shared company database. CEO direction runs first, then supply, catalog, growth and learning departments collaborate through persisted shared context. Keep paid spend, supplier purchase/payment, refunds/payouts, credentials and destructive database actions human-approved.`;
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
        eventType: "COMPANY_AUTOPILOT_DAILY_WORK_QUEUED",
        status: "READY",
        summary: `${newlyQueued.length} bounded company-autopilot task(s) were queued for execution on the shared PostgreSQL work bus.`,
        evidence: {
          version: "v2",
          scheduledDate: today,
          agents: newlyQueued.map((item) => item.agent_id),
          lanes: DAILY_PLAN.map((item) => ({ agentId: item.agentId, lane: item.lane, priority: item.priority })),
          approvalGates: ["paid spend", "supplier purchase/payment", "refunds/payouts", "credentials/secrets", "destructive database actions"],
        },
      });
    }

    const laneCounts = DAILY_PLAN.reduce<Record<string, number>>((acc, item) => {
      acc[item.lane] = (acc[item.lane] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      status: newlyQueued.length ? "QUEUED" : "ALREADY_QUEUED",
      mode: "company-autopilot-v2",
      idempotent: true,
      goal: { id: goalResult.goal.id, title: goalResult.goal.title, created: goalResult.created },
      queued: ensured.map(({ item, created }) => ({ id: item.id, agentId: item.agent_id, title: item.title, priority: item.priority, created, status: item.status })),
      newlyQueuedCount: newlyQueued.length,
      plannedAgentCount: DAILY_PLAN.length,
      laneCounts,
      execution: "Deferred to the existing authenticated company-cycle worker/runtime. Higher-priority CEO and verification tasks are claimed first.",
      policy: "Autopilot can research, verify, draft, stage and recommend. It never activates paid spend, purchases suppliers, moves money, exposes credentials or performs destructive database actions.",
      queuedAt: new Date().toISOString(),
    }, { status: newlyQueued.length ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Company autopilot schedule failed" }, { status: 500 });
  }
}

export async function GET() {
  const laneCounts = DAILY_PLAN.reduce<Record<string, number>>((acc, item) => {
    acc[item.lane] = (acc[item.lane] || 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({
    status: "READY",
    mode: "company-autopilot-v2",
    queueMode: "idempotent-daily",
    idempotent: true,
    plannedAgentCount: DAILY_PLAN.length,
    laneCounts,
    agents: DAILY_PLAN.map((item) => ({ id: item.agentId, name: AGENT_CONTRACTS[item.agentId].name, title: item.title, lane: item.lane, priority: item.priority })),
    rule: "POST requires the automation token. Scheduling creates at most one work item per configured agent per UTC date; execution remains in the authenticated company agent runtime and hard approval gates remain unchanged.",
  });
}
