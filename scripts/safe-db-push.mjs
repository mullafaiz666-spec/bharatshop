import { spawnSync } from "node:child_process";
import { Client } from "pg";

const raw = process.env.DATABASE_URL || "";
if (!raw) {
  console.error("DATABASE_URL is required for db:push");
  process.exit(1);
}

let host = "unknown";
try { host = new URL(raw).hostname; } catch {
  console.error("DATABASE_URL is invalid");
  process.exit(1);
}

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
if (!local && process.env.ALLOW_REMOTE_DB_PUSH !== "YES") {
  console.error(`Refusing schema push to remote PostgreSQL host ${host}.`);
  console.error("Production data is source-of-truth and destructive/forced pushes are forbidden.");
  console.error("For an explicitly reviewed additive remote migration, set ALLOW_REMOTE_DB_PUSH=YES and run without --force.");
  process.exit(2);
}

const env = process.env;
const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd drizzle-kit push"], { stdio: "inherit", env })
  : spawnSync("npx", ["drizzle-kit", "push"], { stdio: "inherit", env });

if (result.error) {
  console.error("Unable to launch drizzle-kit push:", result.error.message);
  process.exit(1);
}
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const agentSchema = [
  `CREATE TABLE IF NOT EXISTS agent_company_goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    priority INTEGER NOT NULL DEFAULT 50,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS agent_work_items (
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
  )`,
  `CREATE TABLE IF NOT EXISTS agent_shared_events (
    id BIGSERIAL PRIMARY KEY,
    goal_id TEXT,
    work_item_id TEXT,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'INFO',
    summary TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS agent_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_company_goals_status ON agent_company_goals(status, priority DESC, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_work_queue ON agent_work_items(status, priority DESC, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_work_goal ON agent_work_items(goal_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_work_agent ON agent_work_items(agent_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_shared_goal ON agent_shared_events(goal_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_shared_agent ON agent_shared_events(agent_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_chat_session ON agent_chat_messages(session_id, agent_id, id DESC)`,
];

const client = new Client({ connectionString: raw, ssl: local ? undefined : { rejectUnauthorized: false } });
try {
  await client.connect();
  for (const statement of agentSchema) await client.query(statement);
  console.log("BharatShop agent shared-state tables verified.");
} catch (error) {
  console.error("Unable to ensure BharatShop agent tables:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
