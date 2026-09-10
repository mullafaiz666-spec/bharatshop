import { aiModels, aiProviderName, runText } from "@/lib/ai/provider";
import { inspectLiveBusinessData, researchWeb } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { catalogQuery } from "@/lib/agents/tools";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";

export type CompactTrace = {
  step: number;
  kind: "tool" | "repair";
  tool?: string;
  status: "SUCCESS" | "FAILED";
  result: unknown;
  durationMs?: number;
  auditId?: number | null;
};

const BUSINESS_AGENTS = new Set<OperationalAgentId>(["ceo", "advertising", "order-recheck", "tracking", "learning", "automation"]);
const CATALOG_AGENTS = new Set<OperationalAgentId>(["ceo", "source-discovery", "source-verification", "image-media", "listing", "marketing", "advertising", "learning", "automation", "web-design"]);
const FRESH_RESEARCH = /\b(latest|current|today|trend|market|competitor|supplier|source|research|search|compare|benchmark|wholesale)\b/i;

export function isTinyGemmaModel(model: string) {
  return /(?:^|[:/_-])(?:270m|0\.27b)(?:$|[:/_-])/i.test(String(model || ""));
}

function trim(value: unknown, max = 700) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return raw.length <= max ? raw : `${raw.slice(0, max)}…`;
}

function compactContext(value: Record<string, unknown> | undefined) {
  if (!value) return "";
  const safe: Record<string, unknown> = {};
  for (const key of ["kpis", "categoryDistribution", "truthPolicy", "agentRole", "agentCapabilities", "requestedPersona"]) {
    if (value[key] !== undefined) safe[key] = value[key];
  }
  return trim(safe, 650);
}

function recordLike(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tinyCeoBusinessEvidence(value: unknown) {
  const business = recordLike(value);
  const products = recordLike(business.products);
  const storefrontOrders = recordLike(business.storefrontOrders);
  const internalOrders = recordLike(business.internalOrders);
  const approvals = Array.isArray(business.pendingApprovals) ? business.pendingApprovals.length : 0;
  return [
    `products total=${Number(products.total || 0)} published=${Number(products.published || 0)} ceoPending=${Number(products.ceo_pending || 0)} staged=${Number(products.staged || 0)} blocked=${Number(products.rejected || 0)} missingImages=${Number(products.missing_images || 0)}`,
    `storeOrders total=${Number(storefrontOrders.total || 0)} revenueINR=${Number(storefrontOrders.revenue || 0)} pending=${Number(storefrontOrders.pending || 0)}`,
    `internalOrders total=${Number(internalOrders.total || 0)} revenueINR=${Number(internalOrders.revenue || 0)} pending=${Number(internalOrders.pending || 0)}`,
    `pendingApprovals=${approvals}`,
  ].join("; ");
}

async function observe(
  trace: CompactTrace[],
  agentName: string,
  tool: string,
  toolInput: Record<string, unknown>,
  fn: () => Promise<unknown>,
) {
  const started = Date.now();
  let result: unknown;
  let status: CompactTrace["status"] = "SUCCESS";
  try {
    result = await fn();
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
    status = "FAILED";
  }

  let auditId: number | null = null;
  try {
    const audit = await recordToolExecution(agentName, tool, toolInput, result, started);
    auditId = Number(audit.id) || null;
  } catch {}

  trace.push({
    step: trace.length + 1,
    kind: "tool",
    tool,
    status,
    result,
    durationMs: Date.now() - started,
    auditId,
  });
  return result;
}

export async function runCompactAgentRuntime(input: {
  agentId: OperationalAgentId;
  objective: string;
  sessionId: string;
  context?: Record<string, unknown>;
  priorError?: string;
  maxAttempts?: number;
  primary?: boolean;
}) {
  const trace: CompactTrace[] = [];
  const evidence: string[] = [];
  const contract = AGENT_CONTRACTS[input.agentId];
  const provider = aiProviderName();
  const model = aiModels().text;
  const tinyModel = isTinyGemmaModel(model);
  const tinyPrimaryCeo = Boolean(input.primary && input.agentId === "ceo" && tinyModel);

  if (BUSINESS_AGENTS.has(input.agentId)) {
    const data = await observe(trace, contract.name, "inspect_business_data", {}, () => inspectLiveBusinessData());
    evidence.push(tinyPrimaryCeo ? tinyCeoBusinessEvidence(data) : `BUSINESS=${trim(data, 650)}`);
  }
  if (CATALOG_AGENTS.has(input.agentId) && !tinyPrimaryCeo) {
    const data = await observe(trace, contract.name, "catalog_query", { limit: 6 }, () => catalogQuery(6));
    evidence.push(`CATALOG=${trim(data, 750)}`);
  }
  if (FRESH_RESEARCH.test(input.objective) && input.agentId !== "tracking" && !tinyPrimaryCeo) {
    const query = input.objective.slice(0, 220);
    const data = await observe(trace, contract.name, "research_web", { query }, () => researchWeb(query));
    evidence.push(`WEB=${trim(data, 700)}`);
  }
  if (!evidence.length) {
    const data = await observe(trace, contract.name, "catalog_query", { limit: 5 }, () => catalogQuery(5));
    evidence.push(`CATALOG=${trim(data, 750)}`);
  }

  const maxAttempts = Math.max(1, Math.min(2, Number(input.maxAttempts ?? (tinyModel ? 1 : 2))));
  const system = tinyPrimaryCeo
    ? "You are BharatShop CEO. Use only EVIDENCE. Reply in one short line: Live: ... Problem: ... Next: ... Never invent."
    : [
        `You are ${contract.name}, a BharatShop operational agent.`,
        `Mission: ${contract.mission}`,
        "Answer only from the verified observations below. Be specific, useful and concise.",
        "Do not invent facts or claim actions that were not executed. Mention uncertainty briefly when evidence is incomplete.",
        `Approval boundary: ${contract.approvalBoundary}`,
        "Give the current finding, biggest issue, and next practical action when relevant.",
      ].join("\n");
  const user = tinyPrimaryCeo
    ? `GOAL: ${trim(input.objective, 150)}\nEVIDENCE: ${trim(evidence.join(" | "), 420)}`
    : [
        `USER GOAL: ${trim(input.objective, tinyModel ? 360 : 500)}`,
        compactContext(input.context) ? `REQUEST CONTEXT: ${compactContext(input.context)}` : "",
        `VERIFIED OBSERVATIONS:\n${evidence.map((item) => trim(item, tinyModel ? 480 : 750)).join("\n")}`,
      ].filter(Boolean).join("\n\n");

  let reply = "";
  let modelError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await runText([
        { role: "system", content: system },
        { role: "user", content: attempt === 1 ? user : `${trim(input.objective, 280)}\nEvidence: ${evidence.map(x => trim(x, 320)).join(" | ")}\nAnswer directly.` },
      ], {
        model,
        temperature: 0.1,
        maxTokens: tinyPrimaryCeo ? 48 : tinyModel ? 180 : attempt === 1 ? 260 : 180,
        timeoutMs: tinyPrimaryCeo ? 50_000 : tinyModel ? 35_000 : 45_000,
      });
      reply = String(response.content || "").trim().replace(/^ANSWER\s*:\s*/i, "");
      if (reply.length >= (tinyModel ? 12 : 25)) break;
      trace.push({ step: trace.length + 1, kind: "repair", status: "FAILED", result: `model returned a shallow answer on compact attempt ${attempt}` });
      reply = "";
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
      trace.push({ step: trace.length + 1, kind: "repair", status: "FAILED", result: `compact model attempt ${attempt}: ${modelError.slice(0, 300)}` });
    }
  }

  if (reply && input.agentId === "ceo") {
    try {
      await recordAudit({
        agentName: contract.name,
        eventType: "CEO_DECISION",
        status: "SUCCESS",
        summary: "CEO produced a live evidence-backed decision response.",
        evidence: {
          sessionId: input.sessionId,
          provider,
          model,
          orchestration: "agent-runtime-v4-compact-evidence-reason",
          toolObservations: trace.filter((item) => item.kind === "tool").map((item) => ({
            tool: item.tool,
            status: item.status,
            auditId: item.auditId ?? null,
          })),
        },
      });
    } catch {}
  }

  return {
    runId: crypto.randomUUID(),
    sessionId: input.sessionId,
    agentId: input.agentId,
    agent: contract.name,
    reply,
    status: reply ? "completed" as const : "unavailable" as const,
    modelStatus: reply ? "live" as const : "unavailable" as const,
    provider,
    model,
    orchestration: "agent-runtime-v4-compact-evidence-reason" as const,
    toolExecutions: trace,
    handoffs: [],
    stepsUsed: trace.length,
    memory: "request-only" as const,
    runtimeRole: input.primary ? "primary" as const : "fallback" as const,
    ...(!input.primary ? { fallbackFrom: "agent-runtime-v4-plan-tool-observe" } : {}),
    ...(input.priorError || modelError ? { modelError: trim(input.priorError || modelError, 600) } : {}),
  };
}

export async function runCompactAgentFallback(input: {
  agentId: OperationalAgentId;
  objective: string;
  sessionId: string;
  context?: Record<string, unknown>;
  priorError?: string;
}) {
  return runCompactAgentRuntime({ ...input, primary: false });
}
