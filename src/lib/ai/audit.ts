import { pool } from "@/db";

export type AuditInput = {
  agentName: string;
  eventType: string;
  status?: string;
  summary?: string;
  evidence?: unknown;
  approvalId?: number;
};

let tablesReady: Promise<void> | null = null;

async function ensureAuditTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_evidence_records (
        id SERIAL PRIMARY KEY,
        agent_name TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (
        id SERIAL PRIMARY KEY,
        agent_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'INFO',
        summary TEXT NOT NULL DEFAULT '',
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        evidence_id INTEGER,
        approval_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      try { await pool.query(`ALTER TABLE agent_audit_records ADD COLUMN IF NOT EXISTS evidence_id INTEGER`); } catch {}
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  await tablesReady;
}

export async function recordEvidence(agentName: string, evidenceType: string, payload: unknown) {
  await ensureAuditTables();
  const result = await pool.query(
    `INSERT INTO agent_evidence_records(agent_name,evidence_type,payload) VALUES($1,$2,$3) RETURNING id,agent_name,evidence_type,created_at`,
    [agentName, evidenceType, JSON.stringify(payload ?? {})],
  );
  return result.rows[0];
}

export async function recordAudit(input: AuditInput) {
  await ensureAuditTables();
  const evidence = input.evidence ?? {};
  const evidenceRecord = await recordEvidence(input.agentName, input.eventType, evidence);
  const result = await pool.query(
    `INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,evidence_id,approval_id)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,agent_name,event_type,status,evidence_id,created_at`,
    [
      input.agentName,
      input.eventType,
      input.status || "INFO",
      input.summary || "",
      JSON.stringify(evidence),
      evidenceRecord.id,
      input.approvalId ?? null,
    ],
  );
  return { ...result.rows[0], evidenceId: evidenceRecord.id };
}

export async function recordToolExecution(
  agentName: string,
  toolName: string,
  input: unknown,
  result: unknown,
  startedAt: number,
  approvalId?: number,
) {
  const failed = !!(result && typeof result === "object" && "error" in result);
  return recordAudit({
    agentName,
    eventType: "TOOL_EXECUTION",
    status: failed ? "FAILED" : "SUCCESS",
    summary: failed ? `${toolName} returned an error.` : `${toolName} executed and returned a result.`,
    evidence: {
      tool: toolName,
      input,
      result,
      durationMs: Date.now() - startedAt,
      observedAt: new Date().toISOString(),
    },
    approvalId,
  });
}
