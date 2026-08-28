import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const SYSTEM = `You are BHARATSHOP AI CEO. Behave like a capable ChatGPT-style senior operator, not a scripted dashboard bot. Answer the operator's actual question directly and naturally. Maintain conversation context and answer follow-ups without restarting your introduction.

Ground BharatShop claims in evidence. For questions about what actually happened, current products/orders/revenue/profit, agent work, audits, blockers, approvals or business status, inspect live BharatShop data before answering. Use web research for current external facts. You may use multiple tools in one turn. Never invent activity, orders, customers, prices, stock, images, suppliers, tracking, financial results or agent work. If the evidence does not establish something, say that plainly and explain what is missing. Distinguish verified fact, inference and recommendation when useful. Do not merely repeat dashboard copy.

You can investigate and prepare actions. Consequential or irreversible actions such as supplier purchases, risky publishing, financial changes or external commitments require an approval request; never claim execution unless a real execution tool reports success. Never request or expose credentials, secrets, API keys or customer PII. When the operator asks a broad question, give a useful CEO-level answer rather than telling them to ask another question.`;

const tools = [
  { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop database state: product totals, internal/storefront orders, recent agent activity, refresh runs and pending approvals. Use for factual operational questions.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "research_web", description: "Research current public web evidence for products, suppliers, brands, markets, images or other current external facts.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Create a persistent human approval request for a consequential action. This prepares the action; it does not execute it.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List current pending CEO approval requests.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

async function runTool(name: string, args: any) {
  if (name === "inspect_live_business_data") return inspectLiveBusinessData();
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function fallback(context: any) {
  const products = context?.products;
  const orders = context?.orders;
  const storefront = context?.storefrontOrders;
  const facts: string[] = [];
  if (products?.total != null) facts.push(`Products: ${products.total}`);
  if (products?.published != null) facts.push(`Published: ${products.published}`);
  if (orders?.total != null) facts.push(`Internal orders: ${orders.total}`);
  if (orders?.revenue != null) facts.push(`Internal revenue: ₹${orders.revenue}`);
  if (orders?.profit != null) facts.push(`Internal net profit: ₹${orders.profit}`);
  if (storefront?.total != null) facts.push(`Storefront orders: ${storefront.total}`);
  if (facts.length) return `I can see these dashboard facts, but the AI reasoning service is unavailable right now:\n\n${facts.join("\n")}\n\nI won't invent the rest. Restore the configured AI provider and I can investigate the live evidence and answer conversationally.`;
  return `The AI reasoning service is unavailable and the request does not contain enough live evidence for a reliable answer. I won't invent an answer.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: fallback(context), mode: "evidence-safe-fallback" });

    const input: any[] = [];
    for (const message of messages) {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = String(message?.content || "").trim();
      if (content) input.push({ role, content });
    }
    if (!input.length || input.at(-1)?.content !== question) input.push({ role: "user", content: question });

    // Keep dashboard context adjacent to the current request, without turning it into
    // a competing user message after the operator's question.
    input.push({ role: "user", content: `SYSTEM-PROVIDED DASHBOARD CONTEXT (evidence only): ${JSON.stringify(context).slice(0, 12000)}` });

    let responseData: any = null;
    for (let round = 0; round < 5; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.6-luna", instructions: SYSTEM, input, tools, tool_choice: "auto" }),
      });
      if (!r.ok) return NextResponse.json({ reply: fallback(context), mode: "evidence-safe-fallback", warning: `AI provider returned ${r.status}` });
      responseData = await r.json();
      const output = Array.isArray(responseData.output) ? responseData.output : [];
      input.push(...output);
      const calls = output.filter((item: any) => item.type === "function_call");
      if (!calls.length) break;
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
        let result: any;
        try { result = await runTool(call.name, args); } catch (error) { result = { error: error instanceof Error ? error.message : "Tool failed" }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 24000) });
      }
    }

    const reply = String(responseData?.output_text || "").trim();
    return NextResponse.json({ reply: reply || fallback(context), mode: reply ? "ai-ceo-live" : "evidence-safe-fallback" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CEO chat failed" }, { status: 500 });
  }
}
