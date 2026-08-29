import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are the senior BharatShop AI operator and speak with the business owner like ChatGPT: natural, warm, direct, intelligent and context-aware. Answer the user's actual request first. Do not sound like a dashboard template or fallback bot. Do not repeat your role or capabilities unless asked.

You are the selected specialist when an agent is selected. Understand follow-ups naturally. If the owner gives an instruction such as "search Google", "create images", "fix this", "check it", "find it", or "do it", treat it as an operational request and use the appropriate tool when one exists. Do not merely describe what you would do when you can actually do it.

Ground current operational claims in live evidence. Never invent products, orders, prices, suppliers, images, stock, tracking, completed work or results. For external current facts use web research. For product media, first identify the exact catalogue product and then use exact-product image search. Never use an unrelated product photo merely because the brand is the same. If exact imagery cannot be established, say so and keep the listing blocked. Do not claim generated imagery exists unless a real generation tool reports success.

A valid supplier does not by itself prove that an arbitrary photograph represents the exact item. Match model/SKU/product attributes first. Prefer several high-confidence views including front, side/back, packaging/contents and real colour variants when available.

Consequential or irreversible actions such as supplier purchases, risky publishing, financial changes or external commitments require human approval. Never claim execution unless a real execution tool reports success. Never expose credentials, API keys or customer PII.

When auditing, investigate first and explain what actually happened, what is weak, why it matters and the exact next move. Be decisive and conversational. Never pad answers.`;

const AGENT_FOCUS: Record<string,string> = {
  "AI CEO": "Own the whole operation and coordinate specialists based on business impact.",
  "Product Research": "Own product discovery, trends, supplier opportunities and margin potential.",
  "Source Verification": "Own source validity, exact product identity, price, stock, shipping and economics.",
  "Image & Media": "Own exact-product imagery, multi-angle galleries, packaging, colour variants and media verification.",
  "Fashion Enrichment": "Own clothing attributes, variants, sizing, fit information and supporting evidence.",
  "Listing & Marketing": "Own customer-facing copy, presentation, positioning and catalogue readiness.",
  "Learning & Analytics": "Own performance evidence, lessons, anomalies and measurable business outcomes.",
  "Advertising": "Own campaign preparation, channel readiness and performance.",
  "Order Re-check": "Own live supplier price, stock, shipping and margin checks before fulfilment.",
  "Fulfilment & Tracking": "Own supplier purchase lifecycle, tracking and delivery; never claim a purchase without evidence."
};

const tools = [
  { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop state including products, orders, agent activity, refreshes and approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "research_web", description: "Research current public web evidence.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "resolve_product_images", description: "Search Google Images for an exact BharatShop catalogue product and save high-confidence matching images to its gallery. Use this when the owner asks to search Google, find images, fix missing product images, or create/find product media. This does not use unrelated images.", parameters: { type: "object", properties: { product_id: { type: "integer" }, product_name: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Prepare a persistent human approval request for a consequential action. Does not execute it.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List pending human approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } }
];

async function runTool(name: string, args: any) {
  if (name === "inspect_live_business_data") return inspectLiveBusinessData();
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "resolve_product_images") return resolveProductImages(args.product_id ? Number(args.product_id) : undefined, args.product_name ? String(args.product_name) : undefined);
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function naturalFallback(question: string, live: any, selectedAgent: string, reason?: string) {
  const q = question.toLowerCase();
  const activities = Array.isArray(live?.recentActivity) ? live.recentActivity : [];
  const blocked = activities.filter((a:any) => /block|warn|fail|error|missing|unavailable/i.test(`${a.status} ${a.message}`));
  if (/image|photo|picture|google|media|gallery|visual/.test(q)) return `I understand the request: solve the missing product imagery, not just report the blocker. The exact-product media tool is currently unavailable${reason ? ` (${reason})` : ""}, so I won't pretend the images were created or found. The safe next step is to search the exact model and only save matching imagery.`;
  if (/audit|recent work|what happened/.test(q)) return activities.length ? `I checked the live activity for ${selectedAgent}. The latest recorded work is ${activities.slice(0,3).map((a:any)=>String(a.message || a.action_type)).filter(Boolean).join("; ")}. ${blocked.length ? `The main concern is ${blocked[0].message}.` : "I don't see a recorded failure in the latest activity."}` : `I don't have enough recorded activity to claim recent work for ${selectedAgent}.`;
  if (/block|stuck|issue|problem|why/.test(q)) return blocked.length ? `The clearest blocker is ${blocked[0].message}` : `I don't see a recorded blocker for ${selectedAgent} in the latest activity.`;
  if (/status|how are|how's|what's happening/.test(q)) return `BharatShop currently has ${live?.products?.total ?? "an unknown number of"} products, ${live?.internalOrders?.total ?? 0} internal orders and ${live?.storefrontOrders?.total ?? 0} storefront orders. ${live?.pendingApprovals?.length ? `${live.pendingApprovals.length} approval(s) are waiting.` : "There are no pending approvals."}`;
  return `I couldn't complete that request through the reasoning service${reason ? ` (${reason})` : ""}. I won't claim work happened when it didn't.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const selectedAgent = String(context.selectedAgent || "AI CEO");
    let live: any = null;
    try { live = await inspectLiveBusinessData(); } catch {}

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: naturalFallback(question, live, selectedAgent, "OPENAI_API_KEY missing"), mode: "evidence-safe-fallback" });

    const instructions = `${BASE_SYSTEM}\n\nSELECTED AGENT: ${selectedAgent}\n${AGENT_FOCUS[selectedAgent] || "Stay focused on the selected agent's domain."}`;
    const input: any[] = [{ role: "developer", content: `LIVE BUSINESS EVIDENCE: ${JSON.stringify({ ...context, liveEvidence: live }).slice(0, 24000)}` }];
    for (const m of messages) {
      const content = String(m?.content || "").trim();
      if (content) input.push({ role: m?.role === "assistant" ? "assistant" : "user", content });
    }
    if (!input.some((x:any) => x.role === "user" && x.content === question)) input.push({ role: "user", content: question });

    let responseData: any = null;
    for (let round = 0; round < 6; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5", instructions, input, tools, tool_choice: "auto" }) });
      if (!r.ok) return NextResponse.json({ reply: naturalFallback(question, live, selectedAgent, `AI provider ${r.status}`), mode: "evidence-safe-fallback" });
      responseData = await r.json();
      const output = Array.isArray(responseData.output) ? responseData.output : [];
      input.push(...output);
      const calls = output.filter((x:any) => x.type === "function_call");
      if (!calls.length) break;
      for (const call of calls) {
        let args:any = {}; try { args = JSON.parse(call.arguments || "{}"); } catch {}
        let result:any; try { result = await runTool(call.name, args); } catch (e) { result = { error: e instanceof Error ? e.message : "Tool failed" }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 30000) });
      }
    }
    const reply = String(responseData?.output_text || "").trim();
    return NextResponse.json({ reply: reply || naturalFallback(question, live, selectedAgent, "empty response"), mode: reply ? "ai-agent-live" : "evidence-safe-fallback" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent chat failed" }, { status: 500 });
  }
}
