import { pool } from "@/db";
import { aiModels, aiProviderName, runText, type AIMessage } from "@/lib/ai/provider";
import {
  createApproval,
  designFashionCollection,
  fashionStudio,
  inspectLiveBusinessData,
  listFashionCommands,
  listPendingApprovals,
  researchWeb,
  resolveProductImages,
} from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { catalogQuery } from "@/lib/agents/tools";
import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";

export type RuntimeMessage = { role: "user" | "assistant"; content: string };
export type RuntimeTrace = {
  step: number;
  kind: "context" | "tool" | "handoff" | "repair";
  tool?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  input?: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
  auditId?: number | null;
};

export type AgentRuntimeRequest = {
  agent?: string;
  objective: string;
  history?: RuntimeMessage[];
  context?: Record<string, unknown>;
  sessionId?: string;
  origin?: string;
  maxSteps?: number;
};

export type AgentRuntimeResult = {
  runId: string;
  sessionId: string;
  agentId: OperationalAgentId;
  agent: string;
  reply: string;
  status: "completed" | "unavailable" | "failed";
  modelStatus: "live" | "unavailable";
  provider: string;
  model: string;
  orchestration: "agent-runtime-v4-plan-tool-observe";
  toolExecutions: RuntimeTrace[];
  handoffs: Array<{ agentId: OperationalAgentId; objective: string; status: string }>;
  stepsUsed: number;
  memory: "postgres+request" | "request-only";
  modelError?: string;
};

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type ToolCall = { name: string; args: Record<string, unknown>; id?: string };

type RunState = {
  runId: string;
  sessionId: string;
  origin: string;
  trace: RuntimeTrace[];
  handoffs: Array<{ agentId: OperationalAgentId; objective: string; status: string }>;
  memoryAvailable: boolean;
  depth: number;
};

const AGENT_ALIASES: Record<string, OperationalAgentId> = {
  ceo: "ceo",
  "ai ceo": "ceo",
  "bharatshop ceo agent": "ceo",
  "product research": "source-discovery",
  "source discovery": "source-discovery",
  "source-discovery": "source-discovery",
  "source verification": "source-verification",
  "source-verification": "source-verification",
  "seller discovery": "seller-discovery",
  "seller-discovery": "seller-discovery",
  "image & media": "image-media",
  "image media": "image-media",
  "image-media": "image-media",
  media: "image-media",
  listing: "listing",
  "listing & marketing": "listing",
  marketing: "marketing",
  advertising: "advertising",
  "order re-check": "order-recheck",
  "order-recheck": "order-recheck",
  "fulfilment & tracking": "tracking",
  "fulfillment & tracking": "tracking",
  tracking: "tracking",
  "learning & analytics": "learning",
  learning: "learning",
  automation: "automation",
  "web design": "web-design",
  "web-design": "web-design",
  "fashion designer": "listing",
  "fashion enrichment": "listing",
};

const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  inspect_business_data: {
    name: "inspect_business_data",
    description: "Read the current BharatShop product, order, revenue, activity and approval summary from production PostgreSQL. Read only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  catalog_query: {
    name: "catalog_query",
    description: "Read top BharatShop catalog products including title, category, price, status and AI score. Read only.",
    parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30 } }, additionalProperties: false },
  },
  research_web: {
    name: "research_web",
    description: "Search current public web/market information through BharatShop's configured search service. Use for fresh trends, competitors, suppliers and external facts.",
    parameters: { type: "object", properties: { query: { type: "string", minLength: 3, maxLength: 300 } }, required: ["query"], additionalProperties: false },
  },
  resolve_product_images: {
    name: "resolve_product_images",
    description: "Resolve and persist only verified source-backed product media for a specified product. This does not use unverified placeholders.",
    parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" } }, additionalProperties: false },
  },
  fashion_studio: {
    name: "fashion_studio",
    description: "Run one explicit BharatShop Fashion Studio command for a product. Use only when the user asks for a fashion creative operation.",
    parameters: { type: "object", properties: { command: { type: "string" }, product_id: { type: "integer" }, product_name: { type: "string" }, count: { type: "integer", minimum: 1, maximum: 12 }, extra_prompt: { type: "string" } }, required: ["command"], additionalProperties: false },
  },
  list_fashion_commands: {
    name: "list_fashion_commands",
    description: "List supported Fashion Studio commands. Read only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  design_fashion_collection: {
    name: "design_fashion_collection",
    description: "Generate a bounded BharatShop fashion collection design job. Use only when explicitly asked for a collection.",
    parameters: { type: "object", properties: { count: { type: "integer", minimum: 3, maximum: 24 } }, additionalProperties: false },
  },
  list_pending_approvals: {
    name: "list_pending_approvals",
    description: "Read pending human approval requests. Read only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  create_approval: {
    name: "create_approval",
    description: "Create a PENDING human approval request for a consequential action. This never executes the action itself.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 3, maxLength: 160 },
        action_type: { type: "string", minLength: 2, maxLength: 80 },
        payload: { type: "object" },
        reason: { type: "string", minLength: 3, maxLength: 500 },
        risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      },
      required: ["title", "action_type", "reason"],
      additionalProperties: false,
    },
  },
  delegate_agent: {
    name: "delegate_agent",
    description: "Hand a focused subtask to another BharatShop specialist agent and receive its answer before continuing.",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string", enum: Object.keys(AGENT_CONTRACTS) },
        objective: { type: "string", minLength: 3, maxLength: 600 },
        context: { type: "object" },
      },
      required: ["agent_id", "objective"],
      additionalProperties: false,
    },
  },
};

const TOOL_PERMISSIONS: Record<OperationalAgentId, string[]> = {
  ceo: ["inspect_business_data", "catalog_query", "research_web", "resolve_product_images", "fashion_studio", "list_fashion_commands", "design_fashion_collection", "list_pending_approvals", "create_approval", "delegate_agent"],
  "source-discovery": ["catalog_query", "research_web"],
  "source-verification": ["catalog_query", "research_web"],
  "seller-discovery": ["research_web"],
  "image-media": ["catalog_query", "research_web", "resolve_product_images"],
  listing: ["catalog_query", "research_web", "resolve_product_images", "fashion_studio", "list_fashion_commands"],
  marketing: ["catalog_query", "research_web", "fashion_studio", "list_fashion_commands"],
  advertising: ["inspect_business_data", "catalog_query", "research_web", "list_pending_approvals", "create_approval"],
  "order-recheck": ["inspect_business_data", "catalog_query", "research_web", "list_pending_approvals", "create_approval"],
  tracking: ["inspect_business_data", "list_pending_approvals", "create_approval"],
  learning: ["inspect_business_data", "catalog_query", "research_web"],
  automation: ["inspect_business_data", "catalog_query", "research_web", "list_pending_approvals", "create_approval", "delegate_agent"],
  "web-design": ["catalog_query", "research_web"],
};

const TOOL_ALIASES: Record<string, string> = {
  research: "research_web",
  web: "research_web",
  search: "research_web",
  catalog: "catalog_query",
  products: "catalog_query",
  business: "inspect_business_data",
  inspect: "inspect_business_data",
  approvals: "list_pending_approvals",
  approval: "create_approval",
  delegate: "delegate_agent",
  handoff: "delegate_agent",
  images: "resolve_product_images",
};

let memoryReady: Promise<void> | null = null;

function resolveAgent(value?: string): OperationalAgentId {
  const normalized = String(value || "ceo").trim().toLowerCase();
  if (normalized in AGENT_CONTRACTS) return normalized as OperationalAgentId;
  return AGENT_ALIASES[normalized] || "ceo";
}

function truncate(value: unknown, max = 2400) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return raw.length <= max ? raw : `${raw.slice(0, max)}…`;
}

function compactResult(value: unknown) {
  if (Array.isArray(value)) return value.slice(0, 12);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(obj).slice(0, 24)) {
    compact[key] = Array.isArray(item) ? item.slice(0, 10) : item;
  }
  return compact;
}

async function ensureMemoryTable() {
  if (!memoryReady) {
    memoryReady = pool.query(`CREATE TABLE IF NOT EXISTS agent_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(async () => {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_chat_session ON agent_chat_messages(session_id, agent_id, id DESC)`);
    }).then(() => undefined).catch((error) => {
      memoryReady = null;
      throw error;
    });
  }
  await memoryReady;
}

async function loadMemory(sessionId: string, agentId: OperationalAgentId): Promise<RuntimeMessage[]> {
  try {
    await ensureMemoryTable();
    const result = await pool.query(
      `SELECT role,content FROM agent_chat_messages WHERE session_id=$1 AND agent_id=$2 ORDER BY id DESC LIMIT 14`,
      [sessionId, agentId],
    );
    return result.rows.reverse().filter((row) => row.role === "user" || row.role === "assistant").map((row) => ({ role: row.role, content: String(row.content) }));
  } catch {
    return [];
  }
}

async function saveMemory(sessionId: string, agentId: OperationalAgentId, role: "user" | "assistant", content: string) {
  try {
    await ensureMemoryTable();
    await pool.query(`INSERT INTO agent_chat_messages(session_id,agent_id,role,content) VALUES($1,$2,$3,$4)`, [sessionId, agentId, role, content.slice(0, 12000)]);
    return true;
  } catch {
    return false;
  }
}

function nativeTools(agentId: OperationalAgentId) {
  return TOOL_PERMISSIONS[agentId].map((name) => ({
    type: "function",
    function: TOOL_DEFINITIONS[name],
  }));
}

function systemPrompt(agentId: OperationalAgentId) {
  const c = AGENT_CONTRACTS[agentId];
  return [
    `You are ${c.name}, an operational BharatShop AI agent.`,
    `Mission: ${c.mission}`,
    "Work like a capable conversational operator: understand the user's goal, gather missing evidence with tools, inspect tool results, then continue until you can give a concrete useful answer.",
    "Never invent business facts, tool results, prices, stock, orders, campaigns, supplier data or successful execution. If evidence is missing, say what is missing.",
    "Production PostgreSQL is the source of truth. Never reset, wipe, drop, destructively reseed or weaken safety/economics gates.",
    `Approval boundary: ${c.approvalBoundary}`,
    "Use tools instead of guessing. You may call multiple tools across multiple turns. After each tool result, decide whether another tool is needed.",
    "Do not expose hidden reasoning or chain-of-thought. Give concise decision rationale, evidence and next actions only.",
    "If the user asks for a consequential action that requires approval, create a pending approval request when that tool is available; never claim the action itself executed.",
    "Final answers should be specific and practical, normally 2-8 short paragraphs or compact bullets when useful; do not force one-sentence answers.",
  ].join("\n");
}

function normalizeToolName(name: unknown) {
  const raw = String(name || "").trim().toLowerCase().replace(/^tool\s*:\s*/, "");
  const normalized = raw.replace(/[\s-]+/g, "_");
  return TOOL_ALIASES[raw] || TOOL_ALIASES[normalized] || normalized;
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseTextToolCall(text: string): ToolCall | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    const name = normalizeToolName(parsed?.tool ?? parsed?.name ?? parsed?.action);
    if (name && TOOL_DEFINITIONS[name]) return { name, args: parseArgs(parsed?.arguments ?? parsed?.args ?? parsed?.input) };
  } catch {}
  const match = cleaned.match(/^TOOL\s*:\s*([a-z0-9_ -]+)(?:\s+(\{[\s\S]*\}))?$/i);
  if (!match) return null;
  const name = normalizeToolName(match[1]);
  if (!TOOL_DEFINITIONS[name]) return null;
  return { name, args: parseArgs(match[2]) };
}

function normalizeNativeToolCall(call: any): ToolCall | null {
  const name = normalizeToolName(call?.function?.name ?? call?.name);
  if (!name || !TOOL_DEFINITIONS[name]) return null;
  return { name, args: parseArgs(call?.function?.arguments ?? call?.arguments), id: String(call?.id || "") || undefined };
}

function toolInputError(name: string, args: Record<string, unknown>) {
  if (name === "research_web" && String(args.query || "").trim().length < 3) return "query is required";
  if (name === "resolve_product_images" && !Number(args.product_id) && !String(args.product_name || "").trim()) return "product_id or product_name is required";
  if (name === "fashion_studio" && !String(args.command || "").trim()) return "command is required";
  if (name === "create_approval" && (!String(args.title || "").trim() || !String(args.action_type || "").trim() || !String(args.reason || "").trim())) return "title, action_type and reason are required";
  if (name === "delegate_agent" && (!String(args.agent_id || "").trim() || !String(args.objective || "").trim())) return "agent_id and objective are required";
  return null;
}

async function executeTool(agentId: OperationalAgentId, call: ToolCall, state: RunState, step: number): Promise<unknown> {
  if (!TOOL_PERMISSIONS[agentId].includes(call.name)) return { error: `${AGENT_CONTRACTS[agentId].name} is not permitted to use ${call.name}` };
  const invalid = toolInputError(call.name, call.args);
  if (invalid) return { error: `${call.name}: ${invalid}` };
  const started = Date.now();
  let result: unknown;
  try {
    switch (call.name) {
      case "inspect_business_data": result = await inspectLiveBusinessData(); break;
      case "catalog_query": result = await catalogQuery(Math.max(1, Math.min(30, Number(call.args.limit || 12)))); break;
      case "research_web": result = await researchWeb(String(call.args.query || "").slice(0, 300)); break;
      case "resolve_product_images": result = await resolveProductImages(Number(call.args.product_id) || undefined, String(call.args.product_name || "").trim() || undefined); break;
      case "fashion_studio": result = await fashionStudio(String(call.args.command), Number(call.args.product_id) || undefined, String(call.args.product_name || "").trim() || undefined, Math.max(1, Math.min(12, Number(call.args.count || 4))), String(call.args.extra_prompt || "").trim() || undefined); break;
      case "list_fashion_commands": result = listFashionCommands(); break;
      case "design_fashion_collection": result = await designFashionCollection(Math.max(3, Math.min(24, Number(call.args.count || 12))), state.origin); break;
      case "list_pending_approvals": result = await listPendingApprovals(); break;
      case "create_approval": result = await createApproval({ title: String(call.args.title), actionType: String(call.args.action_type), payload: call.args.payload ?? {}, reason: String(call.args.reason), riskLevel: String(call.args.risk_level || "MEDIUM") }); break;
      case "delegate_agent": {
        if (state.depth >= 2) {
          result = { error: "handoff depth limit reached" };
          break;
        }
        const delegatedId = resolveAgent(String(call.args.agent_id));
        if (delegatedId === agentId) {
          result = { error: "an agent cannot delegate a task to itself" };
          break;
        }
        const objective = String(call.args.objective).slice(0, 600);
        const child = await runAgentInternal({
          agent: delegatedId,
          objective,
          context: (call.args.context && typeof call.args.context === "object" ? call.args.context : {}) as Record<string, unknown>,
          sessionId: `${state.sessionId}:${delegatedId}`,
          origin: state.origin,
          maxSteps: 3,
        }, state.depth + 1, false);
        state.handoffs.push({ agentId: delegatedId, objective, status: child.status });
        result = { agent: child.agent, status: child.status, reply: child.reply, toolsUsed: child.toolExecutions.filter((x) => x.kind === "tool").map((x) => x.tool) };
        break;
      }
      default: result = { error: `Unknown tool ${call.name}` };
    }
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }

  let auditId: number | null = null;
  try {
    const audit = await recordToolExecution(AGENT_CONTRACTS[agentId].name, call.name, call.args, result, started);
    auditId = Number(audit.id) || null;
  } catch {}
  const failed = !!(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
  state.trace.push({ step, kind: call.name === "delegate_agent" ? "handoff" : "tool", tool: call.name, status: failed ? "FAILED" : "SUCCESS", input: call.args, output: compactResult(result), durationMs: Date.now() - started, auditId });
  return result;
}

function contextMessage(context: Record<string, unknown>) {
  if (!context || !Object.keys(context).length) return "";
  return `Request context (may be incomplete; verify important facts with tools): ${truncate(context, 1800)}`;
}

function shouldSeedCatalog(agentId: OperationalAgentId) {
  return ["ceo", "source-discovery", "source-verification", "image-media", "listing", "marketing", "advertising", "learning", "automation", "web-design"].includes(agentId);
}

function shouldSeedBusiness(agentId: OperationalAgentId) {
  return ["ceo", "advertising", "order-recheck", "tracking", "learning", "automation"].includes(agentId);
}

function needsFreshResearch(objective: string) {
  return /\b(latest|current|today|trend|market|competitor|supplier|source|research|search|compare|benchmark|wholesale)\b/i.test(objective);
}

async function seedEvidence(agentId: OperationalAgentId, objective: string, state: RunState) {
  const observations: string[] = [];
  if (shouldSeedBusiness(agentId) && TOOL_PERMISSIONS[agentId].includes("inspect_business_data")) {
    const result = await executeTool(agentId, { name: "inspect_business_data", args: {} }, state, 0);
    observations.push(`BUSINESS SNAPSHOT: ${truncate(compactResult(result), 1600)}`);
  }
  if (shouldSeedCatalog(agentId) && TOOL_PERMISSIONS[agentId].includes("catalog_query")) {
    const result = await executeTool(agentId, { name: "catalog_query", args: { limit: 10 } }, state, 0);
    observations.push(`CATALOG SNAPSHOT: ${truncate(compactResult(result), 1800)}`);
  }
  if (needsFreshResearch(objective) && TOOL_PERMISSIONS[agentId].includes("research_web")) {
    const result = await executeTool(agentId, { name: "research_web", args: { query: objective.slice(0, 260) } }, state, 0);
    observations.push(`FRESH PUBLIC RESEARCH: ${truncate(compactResult(result), 1800)}`);
  }
  if (observations.length) state.trace.push({ step: 0, kind: "context", status: "SUCCESS", output: { seeded: observations.length } });
  return observations;
}

function weakAnswer(text: string) {
  const cleaned = text.trim();
  if (cleaned.length < 45) return true;
  return /^(ok|okay|done|yes|no|sure|i can help|i will|working on it|completed)[.!\s]*$/i.test(cleaned);
}

async function runAgentInternal(request: AgentRuntimeRequest, depth = 0, persistMemory = true): Promise<AgentRuntimeResult> {
  const agentId = resolveAgent(request.agent);
  const contract = AGENT_CONTRACTS[agentId];
  const runId = crypto.randomUUID();
  const sessionId = String(request.sessionId || crypto.randomUUID()).slice(0, 160);
  const origin = String(request.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const state: RunState = { runId, sessionId, origin, trace: [], handoffs: [], memoryAvailable: false, depth };
  const objective = String(request.objective || "").trim();
  const maxSteps = Math.max(2, Math.min(6, Number(request.maxSteps || 4)));
  const provider = aiProviderName();
  const model = aiModels().text;

  if (!objective) throw new Error("objective is required");

  const saved = persistMemory ? await loadMemory(sessionId, agentId) : [];
  state.memoryAvailable = persistMemory ? await saveMemory(sessionId, agentId, "user", objective) : false;
  const requestHistory = Array.isArray(request.history) ? request.history.slice(-10) : [];
  const history = (saved.length ? saved : requestHistory).slice(-10);
  const seeded = await seedEvidence(agentId, objective, state);

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt(agentId) },
    ...history.filter((m) => m.content && !(m.role === "user" && m.content.trim() === objective)).map((m) => ({ role: m.role, content: truncate(m.content, 900) } as AIMessage)),
  ];
  const extraContext = contextMessage(request.context || {});
  const initial = [objective, extraContext, seeded.length ? `Verified observations already gathered:\n${seeded.join("\n")}` : ""].filter(Boolean).join("\n\n");
  messages.push({ role: "user", content: truncate(initial, 6500) });

  let finalAnswer = "";
  let modelError = "";
  let stepsUsed = 0;
  for (let step = 1; step <= maxSteps; step++) {
    stepsUsed = step;
    let response: Awaited<ReturnType<typeof runText>>;
    try {
      response = await runText(messages, {
        model,
        temperature: step === maxSteps ? 0.15 : 0.1,
        maxTokens: step === maxSteps ? 650 : 420,
        tools: nativeTools(agentId),
        toolChoice: "auto",
        timeoutMs: 45_000,
      });
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
      break;
    }

    const calls = (Array.isArray(response.toolCalls) ? response.toolCalls : []).map(normalizeNativeToolCall).filter(Boolean) as ToolCall[];
    const textualCall = calls.length ? null : parseTextToolCall(response.content);
    if (textualCall) calls.push(textualCall);

    if (calls.length) {
      const permittedCalls = calls.slice(0, 2);
      for (const call of permittedCalls) {
        const result = await executeTool(agentId, call, state, step);
        messages.push({ role: "assistant", content: `I selected the permitted tool ${call.name}.` });
        messages.push({ role: "user", content: `TOOL RESULT ${call.name}: ${truncate(compactResult(result), 2600)}\nContinue the task. Use another tool if needed; otherwise answer the user.` });
      }
      continue;
    }

    const answer = response.content.trim().replace(/^ANSWER\s*:\s*/i, "");
    if (!answer) {
      messages.push({ role: "user", content: "Your previous response was empty. Give a concrete evidence-based answer or use a permitted tool." });
      state.trace.push({ step, kind: "repair", status: "SUCCESS", output: "empty-response repair" });
      continue;
    }
    if (weakAnswer(answer) && step < maxSteps) {
      messages.push({ role: "assistant", content: answer });
      messages.push({ role: "user", content: "That answer is too shallow. Give specific evidence, numbers/results when available, constraints, and the next useful action. Use tools if facts are missing." });
      state.trace.push({ step, kind: "repair", status: "SUCCESS", output: "shallow-answer repair" });
      continue;
    }
    finalAnswer = answer;
    break;
  }

  if (!finalAnswer && !modelError) {
    try {
      const synthesis = await runText([
        { role: "system", content: `${systemPrompt(agentId)}\nThis is the final synthesis. Do not call tools. Use only the verified observations supplied.` },
        { role: "user", content: `Objective: ${objective}\nVerified trace: ${truncate(state.trace.map((x) => ({ tool: x.tool, status: x.status, output: x.output })), 7000)}` },
      ], { model, temperature: 0.1, maxTokens: 650, timeoutMs: 45_000 });
      finalAnswer = synthesis.content.trim();
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
    }
  }

  const status: AgentRuntimeResult["status"] = finalAnswer ? "completed" : "unavailable";
  const reply = finalAnswer || `The local ${model} model is unavailable, so ${contract.name} will not invent an answer. ${state.trace.filter((x) => x.kind === "tool" && x.status === "SUCCESS").length} verified tool step(s) completed before the model stopped.`;
  if (persistMemory) state.memoryAvailable = (await saveMemory(sessionId, agentId, "assistant", reply)) || state.memoryAvailable;
  try {
    await recordAudit({
      agentName: contract.name,
      eventType: "AGENT_RUNTIME_RUN",
      status: status === "completed" ? "SUCCESS" : "FAILED",
      summary: status === "completed" ? "Multi-step conversational agent run completed." : "Agent model was unavailable before a final answer.",
      evidence: { runId, sessionId, agentId, tools: state.trace.map((x) => ({ tool: x.tool, status: x.status, durationMs: x.durationMs })), handoffs: state.handoffs, stepsUsed, model, provider, modelError: modelError || undefined },
    });
  } catch {}

  return {
    runId,
    sessionId,
    agentId,
    agent: contract.name,
    reply,
    status,
    modelStatus: finalAnswer ? "live" : "unavailable",
    provider,
    model,
    orchestration: "agent-runtime-v4-plan-tool-observe",
    toolExecutions: state.trace,
    handoffs: state.handoffs,
    stepsUsed,
    memory: state.memoryAvailable ? "postgres+request" : "request-only",
    ...(modelError ? { modelError: modelError.slice(0, 700) } : {}),
  };
}

export async function runAgentRuntime(request: AgentRuntimeRequest) {
  return runAgentInternal(request, 0, true);
}

export function agentRuntimeCatalog() {
  return Object.values(AGENT_CONTRACTS).map((contract) => ({
    id: contract.id,
    name: contract.name,
    mission: contract.mission,
    tools: TOOL_PERMISSIONS[contract.id],
    approvalBoundary: contract.approvalBoundary,
  }));
}
