import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

async function ensureTable() {
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
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(`SELECT id, title, action_type, payload, reason, risk_level, status, requested_by, created_at, decided_at, decision_note FROM ceo_approvals ORDER BY created_at DESC LIMIT 50`);
    return NextResponse.json({ approvals: result.rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval queue unavailable" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureTable();
    const body = await req.json();
    const action = String(body.action || "");
    if (!["approve", "reject"].includes(action)) return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Valid approval id required" }, { status: 400 });
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    const note = String(body.note || (action === "approve" ? "Approved by operator" : "Rejected by operator"));
    const result = await pool.query(`UPDATE ceo_approvals SET status=$1, decided_at=NOW(), decision_note=$2 WHERE id=$3 AND status='PENDING' RETURNING *`, [status, note, id]);
    if (!result.rows[0]) return NextResponse.json({ error: "Approval not found or already decided" }, { status: 409 });
    return NextResponse.json({ approval: result.rows[0], execution: action === "approve" ? "APPROVED_FOR_EXECUTION" : "BLOCKED" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval update failed" }, { status: 500 });
  }
}
