import { randomUUID } from "node:crypto";
import { pool } from "@/db";
import type { OperationalAgentId } from "@/lib/agents/contracts";

export type CompanyGoal = {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: number;
  created_by: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type AgentWorkItem = {
  id: string;
  goal_id: string | null;
  agent_id: OperationalAgentId;
  title: string;
  objective: string;
  status: string;
  priority: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  run_id: string | null;
  created_by: number | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

let companyTablesReady: Promise<void> | null = null;

export async function ensureCompanyTables() {
  if (!companyTablesReady) {
    companyTablesReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_company_goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        priority INTEGER NOT NULL DEFAULT 50,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_work_items (
        id TEXT PRIMARY KEY,
        goal_id TEXT,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        priority INTEGER NOT NULL DEFAULT 50,
        input JSONB NOT NULL DEFAULT '{}'::jsonb,
        output JSONB NOT NULL DEFAULT '{}'::jsonb,
        run_id TEXT,
        created_by INTEGER,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_shared_events (
        id BIGSERIAL PRIMARY KEY,
        goal_id TEXT,
        work_item_id TEXT,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'INFO',
        summary TEXT NOT NULL DEFAULT '',
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_company_goals_status ON agent_company_goals(status, priority DESC, updated_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_work_queue ON agent_work_items(status, priority DESC, created_at ASC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_work_goal ON agent_work_items(goal_id, updated_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_work_agent ON agent_work_items(agent_id, updated_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_shared_goal ON agent_shared_events(goal_id, id DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_shared_agent ON agent_shared_events(agent_id, id DESC)`);
    })().catch((error) => {
      companyTablesReady = null;
      throw error;
    });
  }
  await companyTablesReady;
}

export async function createCompanyGoal(input: { title: string; objective: string; createdBy?: number | null; priority?: number }) {
  await ensureCompanyTables();
  const id = randomUUID();
  const title = String(input.title || "BharatShop growth objective").trim().slice(0, 180);
  const objective = String(input.objective || "").trim().slice(0, 4000);
  const priority = Math.max(1, Math.min(100, Number(input.priority || 70)));
  if (!objective) throw new Error("Goal objective is required");
  const result = await pool.query<CompanyGoal>(
    `INSERT INTO agent_company_goals(id,title,objective,status,priority,created_by)
     VALUES($1,$2,$3,'ACTIVE',$4,$5) RETURNING *`,
    [id, title, objective, priority, input.createdBy ?? null],
  );
  return result.rows[0];
}

export async function queueAgentWork(input: {
  goalId?: string | null;
  agentId: OperationalAgentId;
  title: string;
  objective: string;
  priority?: number;
  data?: Record<string, unknown>;
  createdBy?: number | null;
}) {
  await ensureCompanyTables();
  const id = randomUUID();
  const result = await pool.query<AgentWorkItem>(
    `INSERT INTO agent_work_items(id,goal_id,agent_id,title,objective,status,priority,input,created_by)
     VALUES($1,$2,$3,$4,$5,'QUEUED',$6,$7::jsonb,$8) RETURNING *`,
    [
      id,
      input.goalId ?? null,
      input.agentId,
      String(input.title).trim().slice(0, 180),
      String(input.objective).trim().slice(0, 4000),
      Math.max(1, Math.min(100, Number(input.priority || 50))),
      JSON.stringify(input.data || {}),
      input.createdBy ?? null,
    ],
  );
  return result.rows[0];
}

export async function startWorkItem(id: string) {
  await ensureCompanyTables();
  const result = await pool.query<AgentWorkItem>(
    `UPDATE agent_work_items SET status='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
     WHERE id=$1 AND status='QUEUED' RETURNING *`,
    [id],
  );
  return result.rows[0] || null;
}

export async function claimQueuedWork(limit = 1) {
  await ensureCompanyTables();
  const safeLimit = Math.max(1, Math.min(3, Number(limit || 1)));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<AgentWorkItem>(
      `SELECT * FROM agent_work_items
       WHERE status='QUEUED'
       ORDER BY priority DESC,created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [safeLimit],
    );
    if (!selected.rows.length) {
      await client.query("COMMIT");
      return [];
    }
    const ids = selected.rows.map((row) => row.id);
    const claimed = await client.query<AgentWorkItem>(
      `UPDATE agent_work_items
       SET status='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
       WHERE id=ANY($1::text[]) RETURNING *`,
      [ids],
    );
    await client.query("COMMIT");
    const order = new Map(ids.map((id, index) => [id, index]));
    return claimed.rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeWorkItem(id: string, input: { status: string; runId?: string | null; output?: Record<string, unknown> }) {
  await ensureCompanyTables();
  const result = await pool.query<AgentWorkItem>(
    `UPDATE agent_work_items
     SET status=$2,run_id=$3,output=$4::jsonb,completed_at=NOW(),updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [id, String(input.status).toUpperCase(), input.runId ?? null, JSON.stringify(input.output || {})],
  );
  return result.rows[0] || null;
}

export async function recordSharedEvent(input: {
  goalId?: string | null;
  workItemId?: string | null;
  agentId: string;
  eventType: string;
  status?: string;
  summary: string;
  evidence?: Record<string, unknown>;
}) {
  await ensureCompanyTables();
  const result = await pool.query(
    `INSERT INTO agent_shared_events(goal_id,work_item_id,agent_id,event_type,status,summary,evidence)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [
      input.goalId ?? null,
      input.workItemId ?? null,
      input.agentId,
      input.eventType,
      String(input.status || "INFO").toUpperCase(),
      input.summary.slice(0, 2000),
      JSON.stringify(input.evidence || {}),
    ],
  );
  return result.rows[0];
}

export async function sharedAgentContext(goalId?: string | null, limit = 18) {
  await ensureCompanyTables();
  const safeLimit = Math.max(4, Math.min(30, Number(limit || 18)));
  const events = goalId
    ? await pool.query(`SELECT id,agent_id,event_type,status,summary,evidence,created_at FROM agent_shared_events WHERE goal_id=$1 ORDER BY id DESC LIMIT $2`, [goalId, safeLimit])
    : await pool.query(`SELECT id,agent_id,event_type,status,summary,evidence,created_at FROM agent_shared_events ORDER BY id DESC LIMIT $1`, [safeLimit]);
  const tasks = goalId
    ? await pool.query(`SELECT id,agent_id,title,status,output,updated_at FROM agent_work_items WHERE goal_id=$1 AND status<>'QUEUED' ORDER BY updated_at DESC LIMIT $2`, [goalId, safeLimit])
    : await pool.query(`SELECT id,agent_id,title,status,output,updated_at FROM agent_work_items WHERE status<>'QUEUED' ORDER BY updated_at DESC LIMIT $1`, [safeLimit]);
  return { events: events.rows.reverse(), recentWork: tasks.rows.reverse() };
}

export async function companySnapshot() {
  await ensureCompanyTables();
  const [goals, work, events, latestByAgent, counts] = await Promise.all([
    pool.query(`SELECT * FROM agent_company_goals ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,priority DESC,updated_at DESC LIMIT 12`),
    pool.query(`SELECT * FROM agent_work_items ORDER BY updated_at DESC LIMIT 120`),
    pool.query(`SELECT * FROM agent_shared_events ORDER BY id DESC LIMIT 80`),
    pool.query(`SELECT DISTINCT ON (agent_id) agent_id,id,title,status,run_id,goal_id,started_at,completed_at,updated_at FROM agent_work_items ORDER BY agent_id,updated_at DESC`),
    pool.query(`SELECT status,COUNT(*)::int AS count FROM agent_work_items GROUP BY status`),
  ]);
  return {
    goals: goals.rows,
    workItems: work.rows,
    sharedEvents: events.rows,
    latestByAgent: latestByAgent.rows,
    workCounts: counts.rows,
    inspectedAt: new Date().toISOString(),
  };
}
