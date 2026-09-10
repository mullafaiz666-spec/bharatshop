import { aiModels, aiProviderName, runText } from "@/lib/ai/provider";
import { inspectLiveBusinessData, researchWeb } from "@/lib/ai/ceo-tools";
import { catalogQuery } from "@/lib/agents/tools";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";

export type CompactTrace = {
  step: number;
  kind: "tool" | "repair";
  tool?: string;
  status: "SUCCESS" | "FAILED";
  result: unknown;
  durationMs?: number;
};

const BUSINESS_AGENTS = new Set<OperationalAgentId>(["ceo", "advertising", "order-recheck", "tracking", "learning", "automation"]);
const CATALOG_AGENTS = new Set<OperationalAgentId>(["ceo", "source-discovery", "source-verification", "listing", "marketing", "advertising", "learning", "automation", "web-design"]);
const FRESH_RESEARCH = /\b(latest|current|today|trend|market|competitor|supplier|source|research|search|compare|benchmark|wholesale)\b/i;

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

async function observe(trace: CompactTrace[], tool: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const result = await fn();
    trace.push({ step: trace.length + 1, kind: "tool", tool, status: "SUCCESS", result, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    const result = { error: error instanceof Error ? error.message : String(error) };
    trace.push({ step: trace.length + 1, kind: "tool", tool, status: "FAILED", result, durationMs: Date.now() - started });
    return result;
  }
}

export async function runCompactAgentFallback(input: {
  agentId: OperationalAgentId;
  objective: string;
  sessionId: string;
  context?: Record<string, unknown>;
  priorError?: string;
}) {
  const trace: CompactTrace[] = [];
  const evidence: string[] = [];

  if (BUSINESS_AGENTS.has(input.agentId)) {
    const data = await observe(trace, "inspect_business_data", () => inspectLiveBusinessData());
    evidence.push(`BUSINESS=${trim(data, 650)}`);
  }
  if (CATALOG_AGENTS.has(input.agentId)) {
    const data = await observe(trace, "catalog_query", () => catalogQuery(6));
    evidence.push(`CATALOG=${trim(data, 750)}`);
  }
  if (FRESH_RESEARCH.test(input.objective) && input.agentId !== "tracking") {
    const data = await observe(trace, "research_web", () => researchWeb(input.objective.slice(0, 220)));
    evidence.push(`WEB=${trim(data, 700)}`);
  }
  if (!evidence.length) {
    const data = await observe(trace, "catalog_query", () => catalogQuery(5));
    evidence.push(`CATALOG=${trim(data, 750)}`);
  }

  const contract = AGENT_CONTRACTS[input.agentId];
  const provider = aiProviderName();
  const model = aiModels().text;
  const system = [
    `You are ${contract.name}, a BharatShop operational agent.`,
    `Mission: ${contract.mission}`,
    "Answer from the verified observations below. Be specific, useful and conversational.",
    "Do not invent facts or claim actions that were not executed. Mention uncertainty briefly when evidence is incomplete.",
    `Approval boundary: ${contract.approvalBoundary}`,
    "Give the current finding, biggest issue, and next practical action when relevant. Keep it compact.",
  ].join("\n");
  const user = [
    `USER GOAL: ${trim(input.objective, 500)}`,
    compactContext(input.context) ? `REQUEST CONTEXT: ${compactContext(input.context)}` : "",
    `VERIFIED OBSERVATIONS:\n${evidence.join("\n")}`,
  ].filter(Boolean).join("\n\n");

  let reply = "";
  let modelError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await runText([
        { role: "system", content: system },
        { role: "user", content: attempt === 1 ? user : `${trim(input.objective, 280)}\nEvidence: ${evidence.map(x => trim(x, 360)).join(" | ")}\nAnswer directly.` },
      ], {
        model,
        temperature: 0.1,
        maxTokens: attempt === 1 ? 260 : 180,
        timeoutMs: 45_000,
      });
      reply = String(response.content || "").trim().replace(/^ANSWER\s*:\s*/i, "");
      if (reply.length >= 25) break;
      trace.push({ step: trace.length + 1, kind: "repair", status: "FAILED", result: `model returned a shallow answer on compact attempt ${attempt}` });
      reply = "";
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
      trace.push({ step: trace.length + 1, kind: "repair", status: "FAILED", result: `compact model attempt ${attempt}: ${modelError.slice(0, 300)}` });
    }
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
    fallbackFrom: "agent-runtime-v4-plan-tool-observe",
    ...(input.priorError || modelError ? { modelError: trim(input.priorError || modelError, 600) } : {}),
  };
}
