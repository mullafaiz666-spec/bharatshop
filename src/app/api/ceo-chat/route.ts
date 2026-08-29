import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are the BharatShop AI CEO. Speak like a genuinely helpful ChatGPT-style executive: natural, warm, concise, confident and conversational. Answer casual conversation naturally. If the owner says "how are you?", respond like a human rather than dumping business metrics. Remember the conversation and understand follow-ups.

You are an operating CEO, not a status-report bot. When the owner asks you to fix, reject, skip, search, inspect, verify or do something, take the real action with an available tool and then report the actual result. Never claim an action happened unless the tool confirms it.

A single bad product must NEVER block the catalogue. If a product cannot get verified exact-product imagery after the configured media attempts, the CEO should reject/skip that product when the owner asks to move on or fix the blocker. Do not substitute an unrelated image.

Fashion Studio commands are real executable actions. The 20 supported commands are returned by list_fashion_commands. When the owner asks for one, use fashion_studio with the exact slash command. Product commands require a product id or product name. Report generation failures honestly. Consequential actions such as purchases, risky publishing, financial changes or external commitments require human approval. Never expose credentials, API keys or customer PII.`;

const AGENT_FOCUS: Record<string,string> = {
  "AI CEO": "Own the whole operation and coordinate specialists based on business impact.",
  "Product Research": "Own product discovery, trends, supplier opportunities and margin potential.",
  "Source Verification": "Own source validity, exact product identity, price, stock, shipping and economics.",
  "Image & Media": "Own exact-product imagery, multi-angle galleries and Fashion Studio generation.",
  "Fashion Enrichment": "Own clothing attributes, variants, sizing and fit information.",
  "Listing & Marketing": "Own customer-facing copy, presentation and catalogue readiness.",
  "Learning & Analytics": "Own performance evidence, lessons and anomalies.",
  "Advertising": "Own campaign preparation and performance.",
  "Order Re-check": "Own live supplier price, stock, shipping and margin checks.",
  "Fulfilment & Tracking": "Own supplier purchase lifecycle and tracking; never claim a purchase without evidence."
};

const tools = [
  { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop state.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "research_web", description: "Research current public web evidence.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "resolve_product_images", description: "Find and save verified exact-product images.", parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "fashion_studio", description: "Execute one of BharatShop's 20 AI Fashion Studio slash commands and persist generated product visuals when a product is supplied.", parameters: { type: "object", properties: { command: { type: "string", enum: listFashionCommands().map(x => x.command) }, product_id: { type: "integer" }, product_name: { type: "string" }, count: { type: "integer" }, extra_prompt: { type: "string" } }, required: ["command"], additionalProperties: false } },
  { type: "function", name: "list_fashion_commands", description: "List all 20 supported Fashion Studio commands and their purposes.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "reject_product", description: "Reject/skip one catalogue product that cannot be verified, allowing the rest of the catalogue to continue.", parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" }, reason: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Prepare a persistent human approval request for a consequential action.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List pending human approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } }
];

async function runTool(name: string, args: any) {
  if (name === "inspect_live_business_data") return inspectLiveBusinessData();
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "resolve_product_images") return resolveProductImages(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined);
  if (name === "fashion_studio") return fashionStudio(String(args.command || ""), args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, args.count ? Number(args.count) : undefined, args.extra_prompt ? String(args.extra_prompt) : undefined);
  if (name === "list_fashion_commands") return listFashionCommands();
  if (name === "reject_product") return rejectProduct(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined, String(args.reason || "No verified exact-product image available; skipping this listing so the catalogue can continue."));
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function slashCommand(question: string) {
  const m = question.match(/^(\/[a-z0-9]+)(?:\s+(.+))?$/i);
  return m ? { command: m[1].toLowerCase(), rest: (m[2] || "").trim() } : null;
}

function naturalFallback(question: string, live: any, selectedAgent: string, reason?: string) {
  const q = question.trim().toLowerCase();
  const activities = Array.isArray(live?.recentActivity) ? live.recentActivity : [];
  const blocked = activities.filter((a:any) => /block|warn|fail|error|missing|unavailable/i.test(`${a.status} ${a.message}`));
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q)) return "Hey! Good to hear from you. What would you like me to take care of?";
  if (/\bhow are you\b|\bhow's it going\b|\bhow are things\b/.test(q)) return "I'm good, thanks! How are you?";
  if (/\bthank(s| you)\b/.test(q)) return "You're welcome. I'm on it.";
  if (/\bwho are you\b/.test(q)) return "I'm the BharatShop AI CEO. I can talk with you naturally, inspect the live business, coordinate the agents and take supported actions for you.";
  if (/\b(block|stuck|issue|problem|why)\b/.test(q)) return blocked.length ? `I found the blocker: ${blocked[0].message}. One product should not stop the operation; I can reject/skip the affected listing and keep the rest moving.` : `I don't see a confirmed blocker for ${selectedAgent} in the latest live activity.`;
  if (/\b(status|dashboard|what's happening)\b/.test(q)) return `We're live. I currently see ${live?.products?.total ?? "an unknown number of"} products and ${live?.internalOrders?.total ?? 0} internal orders. ${live?.pendingApprovals?.length ? `${live.pendingApprovals.length} approval(s) are waiting.` : "Nothing is waiting for approval."}`;
  if (/\b(audit|recent work|what happened)\b/.test(q)) return activities.length ? `I checked the latest live activity for ${selectedAgent}. ${activities.slice(0,3).map((a:any)=>String(a.message || a.action_type)).filter(Boolean).join("; ")}` : `I don't have enough recorded activity to claim recent work for ${selectedAgent}.`;
  if (reason) return `I couldn't complete that action because the AI service reported ${reason}. I won't pretend it succeeded.`;
  return "I understand. Tell me what you want changed and I'll work from the live BharatShop evidence.";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const selectedAgent = String(context.selectedAgent || "AI CEO");
    let live: any = null;
    try { live = await inspectLiveBusinessData(); } catch {}

    const slash = slashCommand(question);
    if (slash) {
      const known = listFashionCommands().some(x => x.command === slash.command);
      if (known) {
        const result = await fashionStudio(slash.command, context.productId ? Number(context.productId) : undefined, context.productName ? String(context.productName) : undefined, undefined, slash.rest);
        return NextResponse.json({ reply: result.success ? `${slash.command} completed. Generated ${result.generated} image(s)${result.productId ? ` and attached them to product ${result.productId}.` : "."}` : `${slash.command} failed: ${result.error}`, mode: "fashion-studio-live", result });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: naturalFallback(question, live, selectedAgent, "OPENAI_API_KEY missing"), mode: "evidence-safe-fallback" });
    const instructions = `${BASE_SYSTEM}\n\nSELECTED AGENT: ${selectedAgent}\n${AGENT_FOCUS[selectedAgent] || "Stay focused on the selected agent's domain."}`;
    const input: any[] = [{ role: "developer", content: `LIVE BUSINESS EVIDENCE: ${JSON.stringify({ ...context, liveEvidence: live }).slice(0, 24000) }` }];
    for (const m of messages) { const content = String(m?.content || "").trim(); if (content) input.push({ role: m?.role === "assistant" ? "assistant" : "user", content }); }
    if (!input.some((x:any) => x.role === "user" && x.content === question)) input.push({ role: "user", content: question });
    let responseData: any = null;
    for (let round = 0; round < 8; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5", instructions, input, tools, tool_choice: "auto" }) });
      if (!r.ok) return NextResponse.json({ reply: naturalFallback(question, live, selectedAgent, `AI provider ${r.status}`), mode: "evidence-safe-fallback" });
      responseData = await r.json();
      const output = Array.isArray(responseData.output) ? responseData.output : [];
      input.push(...output);
      const calls = output.filter((x:any) => x.type === "function_call");
      if (!calls.length) break;
      for (const call of calls) { let args:any = {}; try { args = JSON.parse(call.arguments || "{}"); } catch {} let result:any; try { result = await runTool(call.name, args); } catch (e) { result = { error: e instanceof Error ? e.message : "Tool failed" }; } input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 30000) }); }
    }
    const reply = String(responseData?.output_text || "").trim();
    return NextResponse.json({ reply: reply || naturalFallback(question, live, selectedAgent, "empty response"), mode: reply ? "ai-agent-live" : "evidence-safe-fallback" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Agent chat failed" }, { status: 500 }); }
}
