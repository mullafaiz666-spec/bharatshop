import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are the BharatShop AI CEO, a real conversational operating executive. Speak naturally, directly and contextually, like a capable ChatGPT-style business partner. Never sound like a status bot or scripted command system.

Understand the owner's intent before acting. Use live evidence and the tools available to the selected agent. Decide what evidence is missing, call the appropriate tool, inspect the actual result, and continue the loop when another tool is needed. Never claim an action, result, source, image, approval or business fact that the system did not actually return.

For ordinary conversation, answer naturally without labels such as STATUS, RESULT, ACTION, SYSTEM, AGENT or TOOL. For business work, explain the conclusion and the evidence that supports it. If evidence is insufficient, say so plainly.

Consequential actions such as purchases, spending, risky publishing, financial changes or external commitments require human approval. Never bypass the approval gate. Never expose credentials, API keys or customer PII.

Image integrity is strict: never substitute an unrelated or placeholder image. Only describe an image as verified when the image resolver reports successful verification. A single product failure must not block the catalogue; reject/skip it when appropriate so the rest can continue.

Fashion Studio commands are executable. Use the exact slash command from list_fashion_commands when requested and report failures honestly.`;

const AGENT_FOCUS: Record<string, string> = {
  "AI CEO": "Coordinate the whole operation, decide which specialist capability is needed, and optimize for business impact.",
  "Product Research": "Research product opportunities, trends, suppliers and margin potential. Prefer current web evidence over assumptions.",
  "Source Verification": "Verify exact source identity, pricing, stock, shipping, economics and supporting evidence.",
  "Image & Media": "Resolve and validate exact-product media. Never accept unrelated, placeholder or unverified imagery.",
  "Fashion Enrichment": "Work on fashion attributes, variants, sizing, fit and product enrichment using available evidence.",
  "Listing & Marketing": "Work on customer-facing listing quality, positioning, copy and catalogue readiness.",
  "Learning & Analytics": "Analyze live business evidence, performance, anomalies, outcomes and lessons.",
  "Advertising": "Analyze and prepare advertising decisions using current business evidence and campaign context.",
  "Order Re-check": "Re-check order economics and supplier evidence. Never claim a purchase is safe without sufficient live evidence and never bypass approval.",
  "Fulfilment & Tracking": "Own the fulfilment lifecycle and tracking evidence. Never claim a supplier purchase or shipment without confirmed records."
};

const TOOL_DEFINITIONS: Record<string, any> = {
  inspect_live_business_data: { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop business state, orders, products, recent agent activity, refreshes and pending approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  research_web: { type: "function", name: "research_web", description: "Research current public web evidence for a business question.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  resolve_product_images: { type: "function", name: "resolve_product_images", description: "Find and save verified exact-product images. Never invent or substitute media.", parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" } }, additionalProperties: false } },
  fashion_studio: { type: "function", name: "fashion_studio", description: "Execute a supported BharatShop Fashion Studio command and persist generated visuals when a product is supplied.", parameters: { type: "object", properties: { command: { type: "string", enum: listFashionCommands().map(x => x.command) }, product_id: { type: "integer" }, product_name: { type: "string" }, count: { type: "integer" }, extra_prompt: { type: "string" } }, required: ["command"], additionalProperties: false } },
  list_fashion_commands: { type: "function", name: "list_fashion_commands", description: "List the supported Fashion Studio commands.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  reject_product: { type: "function", name: "reject_product", description: "Reject one catalogue product that cannot be verified so the rest of the catalogue can continue.", parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" }, reason: { type: "string" } }, additionalProperties: false } },
  create_approval: { type: "function", name: "create_approval", description: "Create a persistent human approval request for a consequential action. Do not execute the consequential action itself.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] } }, required: ["title", "action_type", "reason", "risk_level"], additionalProperties: false } },
  list_pending_approvals: { type: "function", name: "list_pending_approvals", description: "List current pending human approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } }
};

const AGENT_TOOLS: Record<string, string[]> = {
  "AI CEO": Object.keys(TOOL_DEFINITIONS),
  "Product Research": ["inspect_live_business_data", "research_web"],
  "Source Verification": ["inspect_live_business_data", "research_web"],
  "Image & Media": ["inspect_live_business_data", "research_web", "resolve_product_images", "fashion_studio", "list_fashion_commands", "reject_product"],
  "Fashion Enrichment": ["inspect_live_business_data", "research_web", "fashion_studio", "list_fashion_commands"],
  "Listing & Marketing": ["inspect_live_business_data", "research_web", "fashion_studio", "list_fashion_commands"],
  "Learning & Analytics": ["inspect_live_business_data", "research_web"],
  "Advertising": ["inspect_live_business_data", "research_web", "list_pending_approvals", "create_approval"],
  "Order Re-check": ["inspect_live_business_data", "research_web", "list_pending_approvals", "create_approval"],
  "Fulfilment & Tracking": ["inspect_live_business_data", "list_pending_approvals", "create_approval"]
};

function toolsFor(agent: string) {
  const names = AGENT_TOOLS[agent] || AGENT_TOOLS["AI CEO"];
  return names.map(name => TOOL_DEFINITIONS[name]);
}

async function runTool(name: string, args: any, agentName: string, trace: any[], approvalId?: number) {
  const startedAt = Date.now();
  let result: any;
  try {
    if (name === "inspect_live_business_data") result = await inspectLiveBusinessData();
    else if (name === "research_web") result = await researchWeb(String(args.query || ""));
    else if (name === "resolve_product_images") result = await resolveProductImages(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined);
    else if (name === "fashion_studio") result = await fashionStudio(String(args.command || ""), args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, args.count ? Number(args.count) : undefined, args.extra_prompt ? String(args.extra_prompt) : undefined);
    else if (name === "list_fashion_commands") result = listFashionCommands();
    else if (name === "reject_product") result = await rejectProduct(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, String(args.reason || "Product could not be verified; skipping it so the catalogue can continue."));
    else if (name === "create_approval") result = await createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
    else if (name === "list_pending_approvals") result = await listPendingApprovals();
    else throw new Error(`Unknown CEO tool: ${name}`);
  } catch (e) {
    result = { error: e instanceof Error ? e.message : "Tool failed" };
  }
  try {
    const audit = await recordToolExecution(agentName, name, args, result, startedAt, approvalId);
    trace.push({ auditId: audit.id, tool: name, input: args, result, status: audit.status, createdAt: audit.created_at });
  } catch (e) {
    trace.push({ auditId: null, tool: name, input: args, result, status: "AUDIT_FAILED", auditError: e instanceof Error ? e.message : "Audit write failed" });
  }
  return result;
}

function slashCommand(question: string) {
  const parts = question.trim().split(" ");
  const command = (parts.shift() || "").toLowerCase();
  if (!/^\/[a-z0-9]+$/i.test(command)) return null;
  return { command, rest: parts.join(" ").trim() };
}

async function failTruthfully(message: string, agentName: string, evidence: any = {}) {
  try { await recordAudit({ agentName, eventType: "CEO_DECISION", status: "FAILED", summary: message, evidence }); } catch {}
  return NextResponse.json({ error: message, code: "CEO_AI_UNAVAILABLE", agent: agentName }, { status: 503 });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });

    const context = body.context ?? {};
    const selectedAgent = String(context.selectedAgent || "AI CEO");
    const tools = toolsFor(selectedAgent);
    let live: any = null;
    try { live = await inspectLiveBusinessData(); } catch (e) { live = { evidenceError: e instanceof Error ? e.message : "Live evidence unavailable" }; }

    const slash = slashCommand(question);
    if (slash && listFashionCommands().some(x => x.command === slash.command)) {
      if (!AGENT_TOOLS[selectedAgent]?.includes("fashion_studio")) return NextResponse.json({ error: `${selectedAgent} does not have permission to execute Fashion Studio commands.`, code: "AGENT_TOOL_NOT_ALLOWED" }, { status: 403 });
      const trace: any[] = [];
      const result = await runTool("fashion_studio", { command: slash.command, extra_prompt: slash.rest, product_id: context.productId, product_name: context.productName }, selectedAgent, trace);
      const reply = result?.success ? `${slash.command} is complete. I generated ${result.generated} image(s)${result.productId ? ` and attached them to product ${result.productId}.` : "."}` : `I couldn't complete ${slash.command}: ${result?.error || "the tool did not confirm success"}`;
      try { await recordAudit({ agentName: selectedAgent, eventType: "CEO_DECISION", status: result?.success ? "SUCCESS" : "FAILED", summary: reply, evidence: { question, selectedAgent, toolExecutions: trace, decision: reply, durationMs: Date.now() - startedAt } }); } catch {}
      return NextResponse.json({ reply, mode: "fashion-studio-live", result });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return failTruthfully("AI CEO is unavailable because the OpenAI service is not configured.", selectedAgent, { question, selectedAgent, liveEvidence: live });

    const instructions = `${BASE_SYSTEM}\n\nSELECTED AGENT: ${selectedAgent}\n${AGENT_FOCUS[selectedAgent] || "Operate only within the selected agent's permitted responsibilities."}\n\nThe selected agent has access only to the tools supplied in this request. Do not pretend to have capabilities outside them.`;
    const input: any[] = [{ role: "developer", content: `LIVE BUSINESS EVIDENCE: ${JSON.stringify({ ...context, liveEvidence: live }).slice(0, 24000)}` }];
    for (const m of messages) { const content = String(m?.content || "").trim(); if (content) input.push({ role: m?.role === "assistant" ? "assistant" : "user", content }); }
    if (!input.some((x: any) => x.role === "user" && x.content === question)) input.push({ role: "user", content: question });

    let responseData: any = null;
    const trace: any[] = [];
    for (let round = 0; round < 8; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.6-luna", instructions, input, tools, tool_choice: "auto" }) });
      if (!r.ok) return failTruthfully("AI CEO is unavailable because the OpenAI service did not return a successful response.", selectedAgent, { question, selectedAgent, providerStatus: r.status, liveEvidence: live, toolExecutions: trace });
      responseData = await r.json();
      const output = Array.isArray(responseData.output) ? responseData.output : [];
      input.push(...output);
      const calls = output.filter((x: any) => x.type === "function_call");
      if (!calls.length) break;
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { args = { _parseError: "Invalid function arguments" }; }
        const result = await runTool(call.name, args, selectedAgent, trace);
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 30000) });
      }
    }

    const reply = String(responseData?.output_text || "").trim();
    if (!reply) return failTruthfully("AI CEO is unavailable because no final AI response was produced.", selectedAgent, { question, selectedAgent, liveEvidence: live, toolExecutions: trace });

    try { await recordAudit({ agentName: selectedAgent, eventType: "CEO_DECISION", status: "SUCCESS", summary: "CEO produced a decision after live evidence and agent-scoped tool processing.", evidence: { question, selectedAgent, toolExecutions: trace, decision: reply, durationMs: Date.now() - startedAt } }); } catch {}
    return NextResponse.json({ reply, mode: "ai-agent-live", agent: selectedAgent, toolExecutions: trace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent chat failed";
    return NextResponse.json({ error: message, code: "CEO_CHAT_FAILED" }, { status: 500 });
  }
}
