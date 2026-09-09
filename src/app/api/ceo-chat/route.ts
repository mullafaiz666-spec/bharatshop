import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands, designFashionCollection } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { aiModels, runText } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are BharatShop AI CEO. Use only supplied facts. Never invent stock, orders, prices, approvals, sources, actions, or successful execution. Spending, purchasing, external commitments, refunds, payouts, credentials, and destructive database work require human approval.`;

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

const allowed = (agent: string, tool: string) => (AGENT_TOOLS[agent] || AGENT_TOOLS["AI CEO"]).includes(tool);
const BOTLIKE = /(live evidence inspection completed|audited tool execution|deterministic summary|model wording step|human fallback|raw json|tool telemetry)/i;

type PlannerDecision =
  | { kind: "tool"; tool: string; args?: Record<string, unknown> }
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
    pendingApprovals: Array.isArray(live?.pendingApprovals) ? live.pendingApprovals.slice(0, 3).map((x: any) => ({ id: x.id, title: x.title, action_type: x.action_type, status: x.status, risk_level: x.risk_level })) : [],
    recentActivity: Array.isArray(live?.recentActivity) ? live.recentActivity.slice(0, 2).map((x: any) => ({ agent: x.agent_name, action: x.action_type, status: x.status })) : [],
  };
}

function compactTrace(trace: any[]) {
  return trace.slice(-2).map(x => ({ tool: x.tool, status: x.status, result: JSON.stringify(x.result ?? {}).slice(0, 260) }));
}

function tinyFacts(evidence: any) {
  const live = evidence?.live || {};
  const p = live.products || {};
  const so = live.storefrontOrders || {};
  const io = live.internalOrders || {};
  const approvals = Array.isArray(live.pendingApprovals) ? live.pendingApprovals.length : 0;
  const observation = Array.isArray(evidence?.tools) && evidence.tools.length ? evidence.tools[evidence.tools.length - 1] : null;
  return [
    `P=${p.total ?? 0}/${p.published ?? 0};ceo=${p.ceo_pending ?? 0};stage=${p.staged ?? 0};rej=${p.rejected ?? 0};img=${p.missing_images ?? 0}`,
    `SO=${so.total ?? 0};pend=${so.pending ?? 0};rev=${so.revenue ?? 0}`,
    `IO=${io.total ?? 0};pend=${io.pending ?? 0}`,
    `A=${approvals}`,
    observation ? `T=${observation.tool}:${observation.status}` : "T=none",
  ].join("|");
}

async function auditDecision(agent: string, status: string, summary: string, evidence: any) {
  try { await recordAudit({ agentName: agent, eventType: "CEO_DECISION", status, summary, evidence }); } catch {}
}

const TOOL_ALIASES: Record<string, string> = {
  p: "create_approval",
  approval: "create_approval",
  create: "create_approval",
  createapproval: "create_approval",
  requestapproval: "create_approval",
  approvalrequest: "create_approval",
  approvals: "list_pending_approvals",
  web: "research_web",
  research: "research_web",
  images: "resolve_product_images",
  media: "resolve_product_images",
};

function normalizeModelTool(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const exact = raw.replace(/^tool\s*:\s*/i, "");
  if (Object.values(AGENT_TOOLS).some(xs => xs.includes(exact))) return exact;
  const compact = exact.replace(/[^a-z0-9]/g, "");
  return TOOL_ALIASES[compact] || TOOL_ALIASES[exact] || exact.replace(/[\s-]+/g, "_");
}

function parsePlannerResponse(text: string): PlannerDecision {
  const cleaned = text.trim().replace(/^```\w*\s*/i, "").replace(/\s*```$/i, "");

  try {
    const raw = JSON.parse(cleaned);
    const jsonTool = raw?.tool ?? raw?.name ?? raw?.action ?? raw?.next_tool ?? raw?.choice;
    if (jsonTool) return { kind: "tool", tool: normalizeModelTool(jsonTool) };
    const jsonAnswer = raw?.answer ?? raw?.reply ?? raw?.response;
    if (typeof jsonAnswer === "string" && jsonAnswer.trim()) return { kind: "final", answer: jsonAnswer.trim() };
  } catch {}

  const toolMatch = cleaned.match(/^TOOL\s*:\s*([^\n]+)/i);
  if (toolMatch) return { kind: "tool", tool: normalizeModelTool(toolMatch[1]) };

  const bare = normalizeModelTool(cleaned);
  if (TOOL_ALIASES[cleaned.toLowerCase()] || Object.values(AGENT_TOOLS).some(xs => xs.includes(bare))) return { kind: "tool", tool: bare };

  const answerMatch = cleaned.match(/^ANSWER\s*:\s*([\s\S]+)/i);
  if (answerMatch?.[1]?.trim()) return { kind: "final", answer: answerMatch[1].trim() };
  if (cleaned.length >= 5 && !BOTLIKE.test(cleaned) && !cleaned.startsWith("{")) return { kind: "final", answer: cleaned };
  throw new Error("Gemma planner returned unusable output");
}

function parseApprovalIntent(question: string) {
  const title = question.match(/titled exactly\s+["“]([^"”]+)["”]/i)?.[1];
  const action = question.match(/\bfor\s+([A-Z][A-Z0-9_]+)\b/i)?.[1]?.toUpperCase();
  const payloadText = question.match(/with payload\s+(\{[\s\S]*?\})(?:\.|$)/i)?.[1];
  if (!title || !action) return null;
  let payload: Record<string, unknown> = {};
  if (payloadText) { try { payload = JSON.parse(payloadText); } catch {} }
  const risk = /low[- ]risk/i.test(question) ? "LOW" : /critical/i.test(question) ? "CRITICAL" : /high[- ]risk/i.test(question) ? "HIGH" : "MEDIUM";
  return { title, action_type: action, payload, reason: "AI CEO requested human authorization; this request does not execute the gated action.", risk_level: risk };
}

function normalizeToolArgs(tool: string, args: Record<string, unknown>, question: string, context: any) {
  const next: Record<string, unknown> = { ...args };
  if (tool === "research_web" && !String(next.query || "").trim()) next.query = question.slice(0, 300);
  if (["resolve_product_images", "fashion_studio", "reject_product"].includes(tool)) {
    if (!next.product_id && context.productId) next.product_id = context.productId;
    if (!next.product_name && context.productName) next.product_name = context.productName;
  }
  if (tool === "design_fashion_collection") next.count = Math.max(3, Math.min(24, Number(next.count || 12)));
  if (tool === "create_approval") Object.assign(next, parseApprovalIntent(question) || {});
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
  const recent = incoming.at(-2)?.content ? String(incoming.at(-2).content).slice(0, 60) : "";
  const system = `BharatShop CEO. Use only F. If F is enough, ANSWER. External-current info may use research_web. If Q asks to create/request approval, MUST use create_approval. Reply only TOOL:<name> or ANSWER:<max 16 words>. Tools:${toolNames.join("|")}`;
  const user = `Q:${question.slice(0, 220)}\nF:${tinyFacts(evidence)}${recent ? `\nR:${recent}` : ""}`;
  const result = await runText([{ role: "system", content: system }, { role: "user", content: user }], { model: aiModels().text, temperature: 0, maxTokens: 20, timeoutMs: 20_000 });
  return parsePlannerResponse(result.content);
}

async function finalWithGemma(question: string, agent: string, evidence: any) {
  const result = await runText([
    { role: "system", content: `${BASE_SYSTEM}\nRole:${agent}. Answer from F in at most 18 words. No internals.` },
    { role: "user", content: `Q:${question.slice(0, 220)}\nF:${tinyFacts(evidence)}` },
  ], { model: aiModels().text, temperature: 0.1, maxTokens: 22, timeoutMs: 20_000 });
  const reply = result.content.trim().replace(/^ANSWER\s*:\s*/i, "");
  if (!reply || BOTLIKE.test(reply)) throw new Error("Gemma returned an empty or system-like final answer");
  return reply;
}

function actionReceipt(tool: string, result: any) {
  if (tool === "create_approval") {
    const id = result?.id ?? result?.approval?.id ?? result?.approvalId;
    const title = result?.title ?? result?.approval?.title;
    return `I created the human approval request${title ? ` “${title}”` : ""}${id ? ` (#${id})` : ""}. Nothing gated was executed.`;
  }
  if (tool === "list_pending_approvals") {
    const approvals = Array.isArray(result) ? result : Array.isArray(result?.approvals) ? result.approvals : [];
    return `There ${approvals.length === 1 ? "is" : "are"} ${approvals.length} pending human approval${approvals.length === 1 ? "" : "s"}.`;
  }
  if (tool === "list_fashion_commands") return `I checked the available explicit fashion commands. ${Array.isArray(result) ? result.length : 0} command(s) are available.`;
  return "The model-selected action completed and its result is recorded in the CEO audit trail.";
}

function unavailableReply(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    reply: "The local Gemma CEO is not responding right now, so I will not substitute a canned system answer.",
    modelStatus: "unavailable",
    modelError: detail.slice(0, 500),
  };
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = await req.json();
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-4) : [];
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

    try {
      const decision = await planWithGemma(question, incoming, agent, evidence);
      if (decision.kind === "final") {
        const reply = String(decision.answer || "").trim();
        if (!reply || BOTLIKE.test(reply)) throw new Error("Gemma returned an unusable CEO answer");
        await auditDecision(agent, "SUCCESS", "Tiny Gemma CEO produced an evidence-grounded answer.", { question, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, durationMs: Date.now() - started });
        return NextResponse.json({ reply, mode: "ai-agent-live", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-compact-plan-act", modelStatus: "live" });
      }

      if (!decision.tool || !allowed(agent, decision.tool)) throw new Error("Gemma selected a tool outside the agent permission set");
      const args = normalizeToolArgs(decision.tool, decision.args || {}, question, context);
      const invalid = validateToolArgs(decision.tool, args);
      if (invalid) throw new Error(invalid);

      const result = await runTool(decision.tool, args, agent, trace, origin);
      evidence = { live: compactLive(live), tools: compactTrace(trace), context: evidence.context };

      const needsSynthesis = ["research_web", "resolve_product_images", "reject_product", "fashion_studio", "design_fashion_collection"].includes(decision.tool);
      const reply = needsSynthesis ? await finalWithGemma(question, agent, evidence) : actionReceipt(decision.tool, result);
      await auditDecision(agent, "SUCCESS", "Tiny Gemma CEO selected and completed a permitted action.", { question, selectedTool: decision.tool, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, durationMs: Date.now() - started });
      return NextResponse.json({ reply, mode: "ai-agent-live", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-compact-plan-act", modelStatus: "live" });
    } catch (modelError) {
      const unavailable = unavailableReply(modelError);
      await auditDecision(agent, "FAILED", "Local Gemma CEO was unavailable; no canned CEO answer was substituted.", { question, toolExecutions: trace, modelError: unavailable.modelError, durationMs: Date.now() - started });
      return NextResponse.json({ ...unavailable, mode: "ai-agent-unavailable", agent, toolExecutions: trace, provider: process.env.AI_PROVIDER || "local-openai-compatible", model: aiModels().text, orchestration: "gemma-compact-plan-act" }, { status: 503 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent chat failed", code: "CEO_CHAT_FAILED" }, { status: 500 });
  }
}
