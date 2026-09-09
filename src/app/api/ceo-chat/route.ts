import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands, designFashionCollection } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { aiModels, runText } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are BharatShop AI CEO, a model-driven ecommerce operator. You decide what evidence or tool is needed, inspect the result, and then answer. Do not behave like a status template or rules bot. Use only supplied live evidence and tool observations. Never invent actions, sources, approvals, stock, images, orders, financial facts, or successful execution. Speak naturally like a senior operator. Distinguish total database records from customer-visible published products. Human approval is mandatory before spending, purchasing, external commitments, or any other gated consequential action.`;

const AGENT_FOCUS: Record<string, string> = {
  "AI CEO": "Coordinate the whole business, diagnose root problems, choose tools, and decide the next safe action from live evidence.",
  "Product Research": "Find product opportunities from public evidence.",
  "Source Verification": "Verify source identity, pricing, availability, and economics.",
  "Image & Media": "Build exact-product media without weakening evidence gates.",
  "Fashion Designer": "Create original men, women, and kids fashion mapped to Qikink made-to-order production.",
  "Fashion Enrichment": "Enrich evidence-backed fashion variants and sizing.",
  "Listing & Marketing": "Prepare truthful customer-facing listings and publication decisions.",
  "Learning & Analytics": "Explain business performance, weak points, and lessons.",
  "Advertising": "Prepare advertising decisions; spending remains human-gated.",
  "Order Re-check": "Re-check order economics; supplier purchasing remains human-gated.",
  "Fulfilment & Tracking": "Review fulfilment, Qikink production, and tracking without inventing shipment state.",
};

const AGENT_TOOLS: Record<string, string[]> = {
  "AI CEO": ["research_web", "resolve_product_images", "fashion_studio", "design_fashion_collection", "list_fashion_commands", "reject_product", "create_approval", "list_pending_approvals"],
  "Product Research": ["research_web"],
  "Source Verification": ["research_web"],
  "Image & Media": ["research_web", "resolve_product_images", "fashion_studio", "list_fashion_commands", "reject_product"],
  "Fashion Designer": ["research_web", "design_fashion_collection", "fashion_studio", "list_fashion_commands"],
  "Fashion Enrichment": ["research_web", "fashion_studio", "list_fashion_commands"],
  "Listing & Marketing": ["research_web"],
  "Learning & Analytics": ["research_web"],
  "Advertising": ["research_web", "list_pending_approvals", "create_approval"],
  "Order Re-check": ["research_web", "list_pending_approvals", "create_approval"],
  "Fulfilment & Tracking": ["list_pending_approvals", "create_approval"],
};

const TOOL_HELP: Record<string, string> = {
  research_web: "Search current public web evidence. args: {query}",
  resolve_product_images: "Resolve exact product images for a selected product. args: {product_id?, product_name?}",
  fashion_studio: "Run a Fashion Studio slash command for a selected product. args: {command, product_id?, product_name?, count?, extra_prompt?}",
  design_fashion_collection: "Create original Qikink made-to-order fashion records. args: {count}",
  list_fashion_commands: "List supported Fashion Studio commands. args: {}",
  reject_product: "Reject/hold a product that failed verification. args: {product_id?, product_name?, reason}",
  create_approval: "Create a human approval request only; it never executes the gated action. args: {title, action_type, payload?, reason, risk_level?}",
  list_pending_approvals: "Read pending human approvals. args: {}",
};

const allowed = (agent: string, tool: string) => (AGENT_TOOLS[agent] || AGENT_TOOLS["AI CEO"]).includes(tool);
const BOTLIKE = /(live evidence inspection completed|audited tool execution|deterministic summary|model wording step|human fallback|raw json|tool telemetry)/i;

type PlannerDecision =
  | { kind: "tool"; tool: string; args?: Record<string, unknown>; reason?: string }
  | { kind: "final"; answer?: string };

function slashCommand(question: string) {
  const parts = question.trim().split(/\s+/);
  const command = (parts.shift() || "").toLowerCase();
  if (!/^\/[a-z0-9]+$/i.test(command)) return null;
  return { command, rest: parts.join(" ").trim() };
}

async function runTool(name: string, args: any, agent: string, trace: any[], origin: string, approvalId?: number) {
  const started = Date.now();
  let result: any;
  try {
    switch (name) {
      case "inspect_live_business_data": result = await inspectLiveBusinessData(); break;
      case "research_web": result = await researchWeb(String(args.query || "")); break;
      case "resolve_product_images": result = await resolveProductImages(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined); break;
      case "fashion_studio": result = await fashionStudio(String(args.command || ""), args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, args.count ? Number(args.count) : undefined, args.extra_prompt ? String(args.extra_prompt) : undefined); break;
      case "design_fashion_collection": result = await designFashionCollection(Math.max(3, Math.min(24, Number(args.count || 12))), origin); break;
      case "list_fashion_commands": result = listFashionCommands(); break;
      case "reject_product": result = await rejectProduct(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, String(args.reason || "Product failed verification")); break;
      case "create_approval": result = await createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level || "MEDIUM") }); break;
      case "list_pending_approvals": result = await listPendingApprovals(); break;
      default: throw new Error(`Unknown CEO tool: ${name}`);
    }
  } catch (error) {
    result = { error: error instanceof Error ? error.message : "Tool failed" };
  }
  try {
    const audit = await recordToolExecution(agent, name, args, result, started, approvalId);
    trace.push({ auditId: audit.id, tool: name, input: args, result, status: audit.status, createdAt: audit.created_at });
  } catch (error) {
    trace.push({ auditId: null, tool: name, input: args, result, status: "AUDIT_FAILED", auditError: error instanceof Error ? error.message : "Audit write failed" });
  }
  return result;
}

function compactLive(live: any) {
  return {
    products: live?.products,
    internalOrders: live?.internalOrders,
    storefrontOrders: live?.storefrontOrders,
    pendingApprovals: Array.isArray(live?.pendingApprovals) ? live.pendingApprovals.slice(0, 8).map((x: any) => ({ id: x.id, title: x.title, action_type: x.action_type, status: x.status, risk_level: x.risk_level })) : [],
    recentActivity: Array.isArray(live?.recentActivity) ? live.recentActivity.slice(0, 8).map((x: any) => ({ agent: x.agent_name, action: x.action_type, status: x.status, message: String(x.message || "").slice(0, 180) })) : [],
    inspectedAt: live?.inspectedAt,
  };
}

function compactTrace(trace: any[]) {
  return trace.slice(-5).map((x) => ({ tool: x.tool, status: x.status, auditId: x.auditId, result: JSON.stringify(x.result ?? {}).slice(0, 1400) }));
}

async function auditDecision(agent: string, status: string, summary: string, evidence: any) {
  try { await recordAudit({ agentName: agent, eventType: "CEO_DECISION", status, summary, evidence }); } catch {}
}

function parsePlannerResponse(text: string): PlannerDecision {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let raw: any = null;
  try { raw = JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { raw = JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
  }
  if (raw) return normalizePlannerDecision(raw);
  if (cleaned.length >= 12 && !BOTLIKE.test(cleaned)) return { kind: "final", answer: cleaned };
  throw new Error("Gemma planner returned unusable output");
}

function normalizePlannerDecision(raw: any): PlannerDecision {
  const kind = String(raw?.kind || "").toLowerCase();
  if (kind === "final") return { kind: "final", answer: typeof raw?.answer === "string" ? raw.answer.trim() : undefined };
  if (kind === "tool") return { kind: "tool", tool: String(raw?.tool || ""), args: raw?.args && typeof raw.args === "object" ? raw.args : {}, reason: typeof raw?.reason === "string" ? raw.reason : undefined };
  throw new Error("Gemma planner returned an invalid decision kind");
}

function normalizeToolArgs(tool: string, args: Record<string, unknown>, question: string, context: any) {
  const next: Record<string, unknown> = { ...args };
  if (tool === "research_web" && !String(next.query || "").trim()) next.query = question.slice(0, 500);
  if (["resolve_product_images", "fashion_studio", "reject_product"].includes(tool)) {
    if (!next.product_id && context.productId) next.product_id = context.productId;
    if (!next.product_name && context.productName) next.product_name = context.productName;
  }
  if (tool === "design_fashion_collection") next.count = Math.max(3, Math.min(24, Number(next.count || 12)));
  return next;
}

function validateToolArgs(tool: string, args: Record<string, unknown>) {
  if (tool === "resolve_product_images" && !args.product_id && !String(args.product_name || "").trim()) return "A product id or product name is required.";
  if (tool === "fashion_studio" && !String(args.command || "").trim()) return "A Fashion Studio command is required.";
  if (tool === "reject_product" && !args.product_id && !String(args.product_name || "").trim()) return "A product id or product name is required to reject a product.";
  if (tool === "create_approval") {
    if (!String(args.title || "").trim()) return "Approval title is required.";
    if (!String(args.action_type || "").trim()) return "Approval action_type is required.";
    if (!String(args.reason || "").trim()) return "Approval reason is required.";
  }
  return null;
}

async function planWithGemma(question: string, incoming: any[], agent: string, evidence: any): Promise<PlannerDecision> {
  const toolNames = AGENT_TOOLS[agent] || AGENT_TOOLS["AI CEO"];
  const toolText = toolNames.map((name) => `- ${name}: ${TOOL_HELP[name]}`).join("\n");
  const recent = incoming.slice(-6).map((m: any) => `${m?.role === "assistant" ? "assistant" : "user"}: ${String(m?.content || "").slice(0, 260)}`).join("\n");
  const system = `${BASE_SYSTEM}\nROLE: ${agent}. ${AGENT_FOCUS[agent] || "Operate only within assigned responsibilities."}\nYou are the decision engine, not a formatter. Decide whether to use ONE permitted tool or answer now. Never claim a tool ran unless it is present in observations. Output ONLY one JSON object in exactly one of these forms:\n{"kind":"tool","tool":"tool_name","args":{},"reason":"short reason"}\n{"kind":"final","answer":"natural answer grounded in evidence"}\nPermitted tools:\n${toolText}`;
  const user = `QUESTION: ${question.slice(0, 700)}\nRECENT CONVERSATION:\n${recent || "(none)"}\nLIVE EVIDENCE AND OBSERVATIONS:\n${JSON.stringify(evidence).slice(0, 4200)}\nChoose the next step.`;
  const result = await runText([{ role: "system", content: system }, { role: "user", content: user }], { model: aiModels().text, temperature: 0.1, maxTokens: 240, timeoutMs: 20_000 });
  return parsePlannerResponse(result.content);
}

async function finalWithGemma(question: string, incoming: any[], agent: string, evidence: any) {
  const recent = incoming.slice(-6).map((m: any) => ({ role: m?.role === "assistant" ? "assistant" as const : "user" as const, content: String(m?.content || "").slice(0, 320) }));
  const result = await runText([
    { role: "system", content: `${BASE_SYSTEM}\nROLE: ${agent}. ${AGENT_FOCUS[agent] || "Operate only within assigned responsibilities."}\nAnswer the user directly from the evidence. Do not mention planner internals, JSON, telemetry, or hidden tool mechanics.` },
    ...recent,
    { role: "user", content: `QUESTION: ${question.slice(0, 700)}\nEVIDENCE: ${JSON.stringify(evidence).slice(0, 4800)}` },
  ], { model: aiModels().text, temperature: 0.2, maxTokens: 280, timeoutMs: 22_000 });
  const reply = result.content.trim();
  if (!reply || BOTLIKE.test(reply)) throw new Error("Gemma returned an empty or system-like final answer");
  return reply;
}

function unavailableReply(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    reply: "The local Gemma CEO is not responding right now, so I am not going to fake an AI answer with a canned system response. The live business tools remain intact; retry once the model runtime is ready.",
    modelStatus: "unavailable",
    modelError: detail.slice(0, 500),
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = await req.json();
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const question = String(body.question || incoming.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });

    const context = body.context ?? {};
    const agent = String(context.selectedAgent || "AI CEO");
    const trace: any[] = [];
    const origin = new URL(req.url).origin;

    const slash = slashCommand(question);
    if (slash && listFashionCommands().some((x) => x.command === slash.command)) {
      if (!allowed(agent, "fashion_studio")) return NextResponse.json({ error: `${agent} does not have permission to execute Fashion Studio commands.`, code: "AGENT_TOOL_NOT_ALLOWED" }, { status: 403 });
      const result = await runTool("fashion_studio", { command: slash.command, extra_prompt: slash.rest, product_id: context.productId, product_name: context.productName }, agent, trace, origin);
      const reply = result?.success ? `I completed ${slash.command}. ${result.generated || 0} image variation(s) were created for the selected product.` : `I couldn’t complete ${slash.command}: ${result?.error || "the generation step returned no usable result"}.`;
      await auditDecision(agent, result?.success ? "SUCCESS" : "FAILED", reply, { question, toolExecutions: trace, durationMs: Date.now() - started });
      return NextResponse.json({ reply, mode: "fashion-studio-live", agent, toolExecutions: trace, result });
    }

    const live = await runTool("inspect_live_business_data", {}, agent, trace, origin);
    let evidence = { live: compactLive(live), tools: compactTrace(trace), context: { productId: context.productId, productName: context.productName } };
    let lastTool = "";

    try {
      for (let turn = 0; turn < 2; turn += 1) {
        const decision = await planWithGemma(question, incoming, agent, evidence);
        if (decision.kind === "final") {
          let reply = String(decision.answer || "").trim();
          if (!reply || BOTLIKE.test(reply)) reply = await finalWithGemma(question, incoming, agent, evidence);
          await auditDecision(agent, "SUCCESS", "Model-driven CEO produced an evidence-grounded decision.", { question, toolExecutions: trace, decision: reply, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, durationMs: Date.now() - started });
          return NextResponse.json({ reply, mode: "ai-agent-live", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-plan-act-observe", modelStatus: "completed" });
        }

        if (!decision.tool || !allowed(agent, decision.tool)) {
          trace.push({ auditId: null, tool: decision.tool || "(missing)", input: decision.args || {}, result: { error: "Model selected a tool outside the agent permission set" }, status: "MODEL_TOOL_REJECTED" });
          evidence = { live: compactLive(live), tools: compactTrace(trace), context: evidence.context };
          continue;
        }

        if (decision.tool === lastTool && decision.tool !== "research_web") {
          trace.push({ auditId: null, tool: decision.tool, input: decision.args || {}, result: { error: "Repeated identical tool selection was blocked to prevent loops" }, status: "MODEL_LOOP_BLOCKED" });
          evidence = { live: compactLive(live), tools: compactTrace(trace), context: evidence.context };
          break;
        }

        const args = normalizeToolArgs(decision.tool, decision.args || {}, question, context);
        const invalid = validateToolArgs(decision.tool, args);
        if (invalid) {
          trace.push({ auditId: null, tool: decision.tool, input: args, result: { error: invalid }, status: "MODEL_ARGS_REJECTED" });
          evidence = { live: compactLive(live), tools: compactTrace(trace), context: evidence.context };
          continue;
        }

        await runTool(decision.tool, args, agent, trace, origin);
        lastTool = decision.tool;
        evidence = { live: compactLive(live), tools: compactTrace(trace), context: evidence.context };
      }

      const reply = await finalWithGemma(question, incoming, agent, evidence);
      await auditDecision(agent, "SUCCESS", "Model-driven CEO completed its plan-act-observe cycle.", { question, toolExecutions: trace, decision: reply, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, durationMs: Date.now() - started });
      return NextResponse.json({ reply, mode: "ai-agent-live", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-plan-act-observe", modelStatus: "completed" });
    } catch (modelError) {
      const unavailable = unavailableReply(modelError);
      await auditDecision(agent, "FAILED", "Local Gemma CEO was unavailable; no canned CEO answer was substituted.", { question, toolExecutions: trace, modelError: unavailable.modelError, durationMs: Date.now() - started });
      return NextResponse.json({ ...unavailable, mode: "ai-agent-unavailable", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-plan-act-observe" }, { status: 503 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent chat failed", code: "CEO_CHAT_FAILED" }, { status: 500 });
  }
}
