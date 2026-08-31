import { pool } from "@/db";

export type AuditInput = {
  agentName: string;
  eventType: string;
  status?: string;
  summary?: string;
  evidence?: unknown;
  approvalId?: number;
};

let tableReady: Promise<void> | null = null;

async function ensureAuditTable() {
  if (!tableReady) {
    tableReady = pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (
      id SERIAL PRIMARY KEY,
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'INFO',
      summary TEXT NOT NULL DEFAULT '',
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      approval_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => undefined).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

export async function recordAudit(input: AuditInput) {
  await ensureAuditTable();
  const result = await pool.query(
    `INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,approval_id)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id,agent_name,event_type,status,created_at`,
    [
      input.agentName,
      input.eventType,
      input.status || "INFO",
      input.summary || "",
      JSON.stringify(input.evidence ?? {}),
      input.approvalId ?? null,
    ],
  );
  return result.rows[0];
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
