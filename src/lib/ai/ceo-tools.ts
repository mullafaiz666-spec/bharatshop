import { pool } from "@/db";
import { serpSearch } from "@/lib/ai/agent-tools";

async function ensureApprovalTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ceo_approvals (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'PENDING',
    requested_by TEXT NOT NULL DEFAULT 'BHARATSHOP AI CEO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decision_note TEXT NOT NULL DEFAULT ''
  )`);
}

export async function createApproval(input: { title: string; actionType: string; payload?: unknown; reason: string; riskLevel?: string }) {
  await ensureApprovalTable();
  const result = await pool.query(`INSERT INTO ceo_approvals (title, action_type, payload, reason, risk_level) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.title, input.actionType, JSON.stringify(input.payload ?? {}), input.reason, input.riskLevel ?? "MEDIUM"]);
  return result.rows[0];
}

export async function listPendingApprovals() {
  await ensureApprovalTable();
  const result = await pool.query(`SELECT id,title,action_type,payload,reason,risk_level,status,created_at FROM ceo_approvals WHERE status='PENDING' ORDER BY created_at DESC LIMIT 20`);
  return result.rows;
}

export async function researchWeb(query: string) {
  const data = await serpSearch(query);
  return {
    organic: Array.isArray(data.organic_results) ? data.organic_results.slice(0, 8).map((x: any) => ({ title: x.title, link: x.link, snippet: x.snippet })) : [],
    shopping: Array.isArray(data.shopping_results) ? data.shopping_results.slice(0, 8).map((x: any) => ({ title: x.title, link: x.link, price: x.price, source: x.source })) : [],
  };
}
