import { pool } from "@/db";
import { checkAI, aiModels, aiProviderName } from "@/lib/ai/provider";
import { publicAgentContracts, type OperationalAgentId } from "@/lib/agents/contracts";
import { agentRuntimeCatalog } from "@/lib/agents/runtime";

export type DependencyProbe = {
  ready: boolean;
  configured: boolean;
  reason: string;
  latencyMs?: number;
  detail?: Record<string, unknown>;
};

type AIProbe = {
  configured?: boolean;
  ready?: boolean;
  modelReady?: boolean;
  degraded?: boolean;
  reason?: string;
  error?: string;
};

function automationTokenConfigured() {
  return Boolean(String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim());
}

async function probeDatabase(): Promise<DependencyProbe> {
  const started = Date.now();
  try {
    const result = await pool.query(`SELECT
      1 AS ok,
      to_regclass('public.agent_work_items')::text AS work_items,
      to_regclass('public.agent_shared_events')::text AS shared_events,
      to_regclass('public.agent_chat_messages')::text AS chat_memory`);
    const row = result.rows[0] || {};
    const tablesReady = Boolean(row.work_items && row.shared_events && row.chat_memory);
    return {
      ready: tablesReady,
      configured: true,
      reason: tablesReady ? "production PostgreSQL query and shared agent tables succeeded" : "PostgreSQL is reachable but one or more shared agent tables are missing",
      latencyMs: Date.now() - started,
      detail: {
        workBusTable: Boolean(row.work_items),
        sharedEventsTable: Boolean(row.shared_events),
        chatMemoryTable: Boolean(row.chat_memory),
      },
    };
  } catch (error) {
    return { ready: false, configured: Boolean(process.env.DATABASE_URL), reason: error instanceof Error ? error.message : "PostgreSQL query failed", latencyMs: Date.now() - started };
  }
}

async function probeSearch(): Promise<DependencyProbe> {
  const started = Date.now();
  const base = String(process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!base) return { ready: false, configured: false, reason: "SEARXNG_URL is not configured" };
  try {
    const url = `${base}/search?` + new URLSearchParams({ q: "BharatShop readiness probe", categories: "general", format: "json", language: "en" }).toString();
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json", "User-Agent": "BharatShop-Agent-Readiness/1.0" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) return { ready: false, configured: true, reason: `SearXNG returned HTTP ${response.status}`, latencyMs: Date.now() - started, detail: { httpStatus: response.status } };
    if (!contentType.includes("application/json")) return { ready: false, configured: true, reason: "SearXNG search did not return JSON", latencyMs: Date.now() - started, detail: { contentType } };
    const body = await response.json().catch(() => null) as { results?: unknown[] } | null;
    return { ready: true, configured: true, reason: "SearXNG JSON search succeeded", latencyMs: Date.now() - started, detail: { resultCount: Array.isArray(body?.results) ? body.results.length : 0 } };
  } catch (error) {
    return { ready: false, configured: true, reason: error instanceof Error ? error.message : "SearXNG probe failed", latencyMs: Date.now() - started };
  }
}

function depsForAgent(id: OperationalAgentId) {
  switch (id) {
    case "ceo": return ["database", "ai", "automation"] as const;
    case "source-discovery": return ["database", "ai", "search"] as const;
    case "source-verification": return ["database", "ai", "search"] as const;
    case "seller-discovery": return ["database", "search"] as const;
    case "image-media": return ["database", "search"] as const;
    case "listing": return ["database"] as const;
    case "marketing": return ["database", "ai"] as const;
    case "advertising": return ["database", "ai"] as const;
    case "order-recheck": return ["database", "ai"] as const;
    case "tracking": return ["database"] as const;
    case "learning": return ["database", "ai"] as const;
    case "automation": return ["database", "ai", "automation"] as const;
    case "web-design": return ["database", "ai"] as const;
  }
}

export async function deepAgentReadiness() {
  const [database, aiRaw, search] = await Promise.all([
    probeDatabase(),
    checkAI(true),
    probeSearch(),
  ]);
  const ai = aiRaw as AIProbe;
  const automation = automationTokenConfigured();
  const runtime = agentRuntimeCatalog();
  const runtimeMap = new Map(runtime.map((entry) => [entry.id, entry]));
  const contracts = publicAgentContracts();

  const infrastructure = {
    database,
    ai: {
      ready: Boolean(ai.ready && ai.modelReady !== false),
      configured: Boolean(ai.configured),
      reason: String(ai.reason || (ai.ready ? "AI provider ready" : "AI provider unavailable")),
      detail: { provider: aiProviderName(), models: aiModels(), modelReady: ai.modelReady, degraded: ai.degraded, error: ai.error },
    } satisfies DependencyProbe,
    search,
    automation: {
      ready: automation,
      configured: automation,
      reason: automation ? "automation authorization token configured" : "automation authorization token missing",
    } satisfies DependencyProbe,
  };

  const agents = contracts.map((contract) => {
    const id = contract.id as OperationalAgentId;
    const deps = depsForAgent(id);
    const runtimeEntry = runtimeMap.get(id);
    const runtimeTools = Array.isArray(runtimeEntry?.tools) ? runtimeEntry.tools : [];
    const dependencyChecks = deps.map((dep) => ({ dependency: dep, ready: infrastructure[dep].ready, reason: infrastructure[dep].reason }));
    const toolMapReady = runtimeTools.length > 0;
    const ready = dependencyChecks.every((item) => item.ready) && toolMapReady;
    return {
      ...contract,
      ready,
      status: ready ? "READY" : "BLOCKED",
      runtimeTools,
      toolMapReady,
      dependencyChecks,
      reason: ready ? "All required runtime dependencies and tool mappings passed." : [
        ...dependencyChecks.filter((item) => !item.ready).map((item) => `${item.dependency}: ${item.reason}`),
        ...(!toolMapReady ? ["runtime tool map is empty"] : []),
      ].join("; "),
    };
  });

  const blocked = agents.filter((agent) => !agent.ready).map((agent) => agent.id);
  return {
    suite: "BharatShop Agent Suite v4",
    promptVersion: "agent-suite-v4",
    provider: { name: aiProviderName(), models: aiModels(), configured: Boolean(ai.configured), ready: infrastructure.ai.ready },
    infrastructure,
    agents,
    summary: { total: agents.length, ready: agents.length - blocked.length, blocked, allReady: blocked.length === 0 },
    checkedAt: new Date().toISOString(),
  };
}

export function configuredAgentReadiness() {
  const ai = Boolean(process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL);
  const search = Boolean(process.env.SEARXNG_URL);
  const database = Boolean(process.env.DATABASE_URL);
  const automation = automationTokenConfigured();
  const runtimeMap = new Map(agentRuntimeCatalog().map((entry) => [entry.id, entry]));
  const infrastructure = {
    database: { ready: database, reason: database ? "DATABASE_URL configured" : "DATABASE_URL missing" },
    ai: { ready: ai, reason: ai ? "AI provider configured" : "AI provider missing" },
    search: { ready: search, reason: search ? "SearXNG configured" : "SearXNG missing" },
    automation: { ready: automation, reason: automation ? "automation token configured" : "automation token missing" },
  };
  const agents = publicAgentContracts().map((contract) => {
    const id = contract.id as OperationalAgentId;
    const deps = depsForAgent(id);
    const runtimeTools = runtimeMap.get(id)?.tools || [];
    const dependencyChecks = deps.map((dep) => ({ dependency: dep, ready: infrastructure[dep].ready, reason: infrastructure[dep].reason }));
    const ready = dependencyChecks.every((item) => item.ready) && runtimeTools.length > 0;
    return { ...contract, ready, status: ready ? "READY" : "BLOCKED", runtimeTools, dependencyChecks, reason: ready ? "Configuration and runtime tool map are present." : dependencyChecks.filter((item) => !item.ready).map((item) => `${item.dependency}: ${item.reason}`).join("; ") };
  });
  const blocked = agents.filter((agent) => !agent.ready).map((agent) => agent.id);
  return { agents, summary: { total: agents.length, ready: agents.length - blocked.length, blocked, allReady: blocked.length === 0 } };
}
