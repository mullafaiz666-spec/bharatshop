import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(process.env.BHARATSHOP_ROOT || process.cwd());
const BRIDGE = join(PROJECT_ROOT, "scripts", "mcp-auth-bridge.mjs");
const MCP_CHAT = join(PROJECT_ROOT, "scripts", "machine-ai-mcp-chat.mjs");
const MCP_ACTION = join(PROJECT_ROOT, "scripts", "machine-ai-mcp-action.mjs");

export type McpConnectorState = {
  name: string;
  state: string;
  readOnly?: boolean;
  tools?: number;
  blockedWriteTools?: number;
  authEnv?: string;
  missing?: string[];
  error?: string;
};

export type McpToolSummary = {
  connector: string;
  name: string;
  description?: string;
};

function redact(value: string) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sbp_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]");
}

async function runNode(script: string, args: string[], timeout: number) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    timeout,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (!String(stdout || "").trim() && String(stderr || "").trim()) {
    throw new Error(redact(String(stderr).trim()).slice(0, 1600));
  }
  return redact(String(stdout || "").trim());
}

function allowedConnector(connector: string) {
  const value = String(connector || "all").toLowerCase();
  if (!["all", "github", "supabase", "apper", "local"].includes(value)) {
    throw new Error(`Unsupported MCP connector: ${value}`);
  }
  return value;
}

export async function mcpControl(command: "status" | "tools" | "test", connector = "all") {
  const safeConnector = allowedConnector(connector);
  const output = await runNode(BRIDGE, [command, safeConnector], command === "tools" ? 90_000 : 60_000);
  try {
    return JSON.parse(output) as McpConnectorState[] | McpToolSummary[];
  } catch {
    throw new Error(`MCP ${command} returned invalid JSON.`);
  }
}

function cleanTask(task: string) {
  const clean = String(task || "").trim();
  if (!clean) throw new Error("MCP task is empty.");
  if (clean.length > 12_000) throw new Error("MCP task is too large.");
  return clean;
}

export async function mcpTask(task: string) {
  return runNode(MCP_CHAT, [cleanTask(task)], 240_000);
}

export async function mcpActionTask(task: string) {
  return runNode(MCP_ACTION, [cleanTask(task)], 300_000);
}

export function formatMcpStatus(value: unknown) {
  const states = Array.isArray(value) ? value as McpConnectorState[] : [];
  if (!states.length) return "MCP CONNECTORS\nNo connector status was returned.";
  const lines = states.map((item) => {
    const extras = [
      typeof item.tools === "number" ? `tools=${item.tools}` : "",
      typeof item.blockedWriteTools === "number" && item.blockedWriteTools > 0 ? `blocked-write-tools=${item.blockedWriteTools}` : "",
      item.readOnly === true ? "read-only default" : "",
      item.missing?.length ? `missing=${item.missing.join(",")}` : "",
      item.error ? `error=${item.error}` : "",
    ].filter(Boolean).join("; ");
    return `${item.name.toUpperCase()}: ${item.state}${extras ? ` (${extras})` : ""}`;
  });
  return `MCP CONNECTORS\n${lines.join("\n")}`;
}

export function formatMcpTools(value: unknown) {
  const tools = Array.isArray(value) ? value as McpToolSummary[] : [];
  if (!tools.length) return "MCP TOOLS\nNo verified tools were returned.";
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool.connector, (counts.get(tool.connector) || 0) + 1);
  const summary = [...counts.entries()].map(([name, count]) => `${name}: ${count}`).join(", ");
  const names = tools.slice(0, 80).map((tool) => `${tool.connector}.${tool.name}`).join("\n");
  return `MCP TOOLS\nCounts: ${summary}\n${names}${tools.length > 80 ? `\n… ${tools.length - 80} more` : ""}`;
}

export function formatAudit(runtime: Record<string, unknown>, mcp: unknown) {
  const supervisor = (runtime.supervisor || {}) as Record<string, unknown>;
  const tasks = (runtime.tasks || {}) as Record<string, unknown>;
  const memory = (runtime.memory || {}) as Record<string, unknown>;
  const states = Array.isArray(mcp) ? mcp as McpConnectorState[] : [];
  const mcpVerified = states.length > 0 && states.every((item) => item.state === "VERIFIED");
  return [
    `LOCAL READ-ONLY AUDIT — ${new Date().toISOString()}`,
    "",
    `Ollama: ${runtime.ollamaReady ? "RESPONDING" : "NOT RESPONDING"}`,
    `Configured model: ${String(runtime.model || "unknown")}; installed: ${runtime.modelInstalled ? "true" : "false"}`,
    `Registered agent definitions: ${String(runtime.agents ?? 0)}`,
    `Supervisor: ${supervisor.online ? "ONLINE" : "NOT VERIFIED"}${supervisor.state ? ` (${String(supervisor.state)})` : ""}`,
    `Queue files: pending=${String(tasks.pending ?? 0)}, running=${String(tasks.running ?? 0)}, completed=${String(tasks.completed ?? 0)}`,
    `Memory: ${memory.enabled ? "enabled" : "disabled"}; entries=${String(memory.entries ?? 0)}`,
    "",
    formatMcpStatus(states),
    "",
    `MCP SYSTEM = ${mcpVerified ? "VERIFIED" : "NEEDS WORK"}`,
    "Audit mode is read-only. Controlled Apper writes are available only through explicit /mcp action tasks.",
    "No production writes, deploys, merges, payments, or destructive database actions were performed by this audit.",
  ].join("\n");
}
