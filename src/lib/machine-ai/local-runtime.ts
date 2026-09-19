import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { specialistAiEmployee } from "@/lib/agents/employees";

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };
export type MachineRoute = "chat" | "agency";

export type AgentRecord = {
  slug: string;
  shortSlug: string;
  name: string;
  description: string;
  division: string;
  content: string;
};

export type UploadRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
};

const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || process.env.AI_TEXT_MODEL || "qwen3.5:4b";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const CONTEXT = Number(process.env.PERSONAL_AI_CONTEXT || "32768");
const MACHINE_HOME = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "BharatShop", "MachineAI");
const PERSONAL_HOME = process.env.PERSONAL_AI_HOME || join(homedir(), ".bharatshop-ai");
const AGENCY_HOME = process.env.AGENCY_HOME || join(homedir(), ".bharatshop-agency");
const CATALOG_DIR = join(AGENCY_HOME, "agency-agents");
const MEMORY_FILE = join(PERSONAL_HOME, "memory.jsonl");
const HEARTBEAT_FILE = join(MACHINE_HOME, "heartbeat.json");
const PENDING_DIR = join(MACHINE_HOME, "pending");
const RUNNING_DIR = join(MACHINE_HOME, "running");
const RESULTS_DIR = join(MACHINE_HOME, "results");
const UPLOADS_DIR = join(MACHINE_HOME, "uploads");

for (const dir of [MACHINE_HOME, PERSONAL_HOME, PENDING_DIR, RUNNING_DIR, RESULTS_DIR, UPLOADS_DIR]) {
  mkdirSync(dir, { recursive: true });
}

function envTrue(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

export function isLoopbackRequest(request: Request) {
  if (envTrue(process.env.BHARATSHOP_MACHINE_AI_ALLOW_REMOTE)) return true;
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function localOnlyError() {
  return Response.json(
    { error: "Machine AI web access is local-only. Open it from http://127.0.0.1:3001 or http://localhost:3001 on this computer." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

function readJson(path: string) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function countJsonFiles(path: string) {
  try {
    return readdirSync(path).filter((name) => name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function parseFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return {} as Record<string, string>;
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {} as Record<string, string>;
  const result: Record<string, string> = {};
  for (const line of markdown.slice(3, end).trim().split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim();
  }
  return result;
}

export function discoverAgents(): AgentRecord[] {
  const divisionsPath = join(CATALOG_DIR, "divisions.json");
  if (!existsSync(divisionsPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(divisionsPath, "utf8")) as { divisions?: Record<string, unknown> };
    const divisions = parsed.divisions || {};
    const agents: AgentRecord[] = [];
    for (const division of Object.keys(divisions)) {
      const dir = join(CATALOG_DIR, division);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md")) continue;
        const content = readFileSync(join(dir, file), "utf8");
        const meta = parseFrontmatter(content);
        const slug = basename(file, ".md");
        const shortSlug = slug.startsWith(`${division}-`) ? slug.slice(division.length + 1) : slug;
        agents.push({
          slug,
          shortSlug,
          name: meta.name || shortSlug.replace(/-/g, " "),
          description: meta.description || "",
          division,
          content,
        });
      }
    }
    return agents.sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

export function publicAgents(query = "") {
  const q = query.trim().toLowerCase();
  return discoverAgents()
    .filter((agent) => !q || `${agent.name} ${agent.slug} ${agent.description} ${agent.division}`.toLowerCase().includes(q))
    .map(({ slug, shortSlug, name, description, division }) => ({
      slug,
      shortSlug,
      name,
      description,
      division,
      employee: specialistAiEmployee({ slug, name, description, division }),
    }));
}

function agentScore(agent: AgentRecord, task: string) {
  const tokens = [...new Set(task.toLowerCase().match(/[a-z0-9]{4,}/g) || [])];
  const haystack = `${agent.slug} ${agent.shortSlug} ${agent.name} ${agent.description} ${agent.division}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

export function selectAgents(task: string, limit = 3) {
  const agents = discoverAgents();
  const ranked = agents
    .map((agent) => ({ agent, score: agentScore(agent, task) }))
    .sort((a, b) => b.score - a.score || a.agent.slug.localeCompare(b.agent.slug));
  const selected = ranked.filter((item) => item.score > 0).slice(0, limit).map((item) => item.agent);
  if (!selected.length) selected.push(...agents.slice(0, limit));
  return selected;
}

export async function ollamaModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return [] as string[];
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    return Array.isArray(payload.models) ? payload.models.map((item) => item.name || item.model || "").filter(Boolean) : [];
  } catch {
    return [] as string[];
  }
}

export async function runtimeStatus() {
  const installedModels = await ollamaModels();
  const heartbeat = readJson(HEARTBEAT_FILE);
  const updatedAt = typeof heartbeat?.updatedAt === "string" ? heartbeat.updatedAt : "";
  const heartbeatAge = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Number.POSITIVE_INFINITY;
  const agents = discoverAgents();
  return {
    localOnly: true,
    model: MODEL,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    ollamaReady: installedModels.length > 0,
    modelInstalled: installedModels.includes(MODEL),
    installedModels,
    agents: agents.length,
    divisions: [...new Set(agents.map((agent) => agent.division))].length,
    supervisor: {
      online: Boolean(heartbeat && heartbeatAge < 60_000),
      state: typeof heartbeat?.state === "string" ? heartbeat.state : "UNKNOWN",
      detail: typeof heartbeat?.detail === "string" ? heartbeat.detail : "No recent heartbeat found",
      updatedAt,
      pid: typeof heartbeat?.supervisorPid === "number" ? heartbeat.supervisorPid : null,
    },
    tasks: {
      pending: countJsonFiles(PENDING_DIR),
      running: countJsonFiles(RUNNING_DIR),
      completed: countJsonFiles(RESULTS_DIR),
    },
    memory: {
      enabled: !/^(0|false|off|no)$/i.test(String(process.env.PERSONAL_AI_MEMORY || "true")),
      entries: recentMemory(10).length,
      pathLabel: "~/.bharatshop-ai/memory.jsonl",
    },
    externalTools: "approval-gated",
  };
}

function memorySafe(text: string) {
  return !/(password|passcode|private key|secret|api[_ -]?key|access[_ -]?token|bearer\s+[a-z0-9._-]+)/i.test(text || "");
}

export function remember(role: ChatRole, content: string, route: MachineRoute = "chat") {
  if (/^(0|false|off|no)$/i.test(String(process.env.PERSONAL_AI_MEMORY || "true"))) return;
  if (!content.trim() || !memorySafe(content)) return;
  appendFileSync(MEMORY_FILE, `${JSON.stringify({ at: new Date().toISOString(), role, route, content: content.trim() })}\n`, "utf8");
}

export function recentMemory(limit = 20) {
  if (!existsSync(MEMORY_FILE)) return [] as Array<{ at?: string; role?: string; route?: string; content?: string }>;
  try {
    return readFileSync(MEMORY_FILE, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 100)))
      .map((line) => JSON.parse(line) as { at?: string; role?: string; route?: string; content?: string });
  } catch {
    return [];
  }
}

export function clearWorkingMemory() {
  if (!existsSync(MEMORY_FILE)) return { cleared: 0, backup: null as string | null };
  const existing = readFileSync(MEMORY_FILE, "utf8");
  const count = existing.split(/\r?\n/).filter(Boolean).length;
  const backup = join(PERSONAL_HOME, `memory.${new Date().toISOString().replace(/[:.]/g, "-")}.bak.jsonl`);
  renameSync(MEMORY_FILE, backup);
  writeFileSync(MEMORY_FILE, "", "utf8");
  return { cleared: count, backup: basename(backup) };
}

export function buildSystemPrompt(installedModels: string[], attachmentContext = "") {
  const memory = recentMemory(8)
    .map((item) => `${item.role || "memory"}: ${String(item.content || "").slice(0, 1_200)}`)
    .join("\n");
  return `You are the user's private BharatShop laptop AI running locally through Ollama.\nActive model: ${MODEL}.\nOllama endpoint: ${OLLAMA_BASE_URL}.\nInstalled model names: ${installedModels.join(", ") || MODEL}.\n\nThe broader BharatShop laptop stack includes specialist agents, a 24x7 queue, local memory, browser/coding/company tools and external connectors. Never claim an external action was completed unless that tool actually ran. Production changes, payments, publishing, destructive actions and credential handling remain approval-gated. Never request or expose secrets. Be practical and concise.\n\nRECENT LOCAL MEMORY:\n${memory || "No saved memory yet."}${attachmentContext ? `\n\nLOCAL ATTACHMENTS:\n${attachmentContext}` : ""}`;
}

export async function ollamaChatOnce(systemPrompt: string, messages: ChatMessage[]) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      options: { num_ctx: CONTEXT },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Ollama request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const payload = (await response.json()) as { message?: { content?: string } };
  return String(payload.message?.content || "").trim();
}

export async function openOllamaStream(systemPrompt: string, messages: ChatMessage[]) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      think: false,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      options: { num_ctx: CONTEXT },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body) throw new Error(`Ollama request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response;
}

export async function buildAgencyContext(task: string) {
  const selected = selectAgents(task, 3);
  if (!selected.length) throw new Error("Agency catalog is not installed. Run npm.cmd run agency:setup first.");
  const reports: Array<{ name: string; answer: string }> = [];
  for (const agent of selected) {
    const answer = await ollamaChatOnce(
      `${agent.content}\n\nLOCAL MACHINE MODE\nYou are a BharatShop specialist running through local Ollama model ${MODEL}. Do not claim external actions were performed. Do not request secrets. Production changes, browser actions, publishing, payments and destructive actions are approval-gated. Give a concrete specialist report.`,
      [{ role: "user", content: task }],
    );
    reports.push({ name: agent.name, answer });
  }
  return {
    selected: selected.map((agent) => ({ slug: agent.slug, name: agent.name, division: agent.division })),
    synthesisPrompt: `You are the BharatShop local Agency Manager running through Ollama model ${MODEL}. Synthesize the specialist reports into one concise practical answer. Preserve uncertainty. Do not invent completed external actions.\n\nTASK:\n${task}\n\nREPORTS:\n${reports.map((item) => `## ${item.name}\n${item.answer}`).join("\n\n")}`,
  };
}

export function queueTask(task: string, route: MachineRoute) {
  const cleanTask = task.trim();
  if (!cleanTask) throw new Error("Task text is empty.");
  if (!(["chat", "agency"] as const).includes(route)) throw new Error("Only chat and agency routes can run in the background queue.");
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const payload = { id, createdAt: new Date().toISOString(), task: cleanTask, route };
  writeFileSync(join(PENDING_DIR, `${id}.json`), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function readTaskDir(dir: string, state: "pending" | "running" | "completed", limit: number) {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit)
      .map((name) => ({ state, file: name, ...(readJson(join(dir, name)) || {}) }));
  } catch {
    return [] as Array<Record<string, unknown>>;
  }
}

export function taskSnapshot(limit = 12) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  return {
    counts: {
      pending: countJsonFiles(PENDING_DIR),
      running: countJsonFiles(RUNNING_DIR),
      completed: countJsonFiles(RESULTS_DIR),
    },
    items: [
      ...readTaskDir(RUNNING_DIR, "running", safeLimit),
      ...readTaskDir(PENDING_DIR, "pending", safeLimit),
      ...readTaskDir(RESULTS_DIR, "completed", safeLimit),
    ].slice(0, safeLimit),
  };
}

function safeFileName(name: string) {
  const base = basename(name || "upload").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "upload").slice(0, 120);
}

export async function saveUpload(file: File): Promise<UploadRecord> {
  const maxBytes = Math.max(1, Number(process.env.BHARATSHOP_MACHINE_AI_UPLOAD_MB || "15")) * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`File is too large. Local upload limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const name = safeFileName(file.name);
  writeFileSync(join(UPLOADS_DIR, `${id}--${name}`), Buffer.from(await file.arrayBuffer()));
  return { id, name, type: file.type || "application/octet-stream", size: file.size };
}

function resolveUpload(id: string) {
  if (!/^[0-9]+-[a-f0-9]{8}$/i.test(id)) return null;
  const prefix = `${id}--`;
  const name = readdirSync(UPLOADS_DIR).find((item) => item.startsWith(prefix));
  if (!name) return null;
  const candidate = resolve(UPLOADS_DIR, name);
  const root = `${resolve(UPLOADS_DIR)}${sep}`;
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

export function attachmentContext(ids: string[]) {
  const chunks: string[] = [];
  for (const id of ids.slice(0, 5)) {
    const path = resolveUpload(id);
    if (!path) continue;
    const name = basename(path).replace(/^[^-]+-[^-]+--/, "");
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const textLike = new Set(["txt", "md", "json", "csv", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "html", "css", "xml", "yaml", "yml", "log"]);
    if (textLike.has(ext)) {
      try {
        const raw = readFileSync(path, "utf8").slice(0, 40_000);
        chunks.push(`FILE ${name}:\n${raw}`);
      } catch {
        chunks.push(`FILE ${name}: could not be read as text.`);
      }
    } else {
      chunks.push(`FILE ${name}: stored locally. This current text bridge does not inspect binary/image pixels automatically.`);
    }
  }
  return chunks.join("\n\n");
}

export const machineRuntimeInfo = {
  model: MODEL,
  ollamaBaseUrl: OLLAMA_BASE_URL,
  machineHomeLabel: "%LOCALAPPDATA%/BharatShop/MachineAI",
};
