import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the real BHARATSHOP AI CEO, a conversational senior operator. Answer the operator's actual question directly, like ChatGPT, while grounding business claims in live BharatShop evidence. You have tools for live database inspection, current web research and approval management. Use live inspection for questions about orders, products, revenue, profit, agents, activity, audits, failures, blockers, approvals or what actually happened. Use web research for current external facts. You may combine tools. Never invent activity, orders, customers, prices, stock, images, supplier identity, tracking, financial results or agent work. Distinguish VERIFIED FACTS, INFERENCE and RECOMMENDATION when useful. If evidence is missing, say exactly what is missing. Do not merely repeat dashboard text. Answer follow-up questions using the conversation context. For consequential or irreversible actions, prepare an approval request rather than claiming execution. Never request or expose credentials, secrets or API keys. Protect customer PII.`;

const tools = [
  { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop database state: product/order totals, storefront orders, recent agent activity, refresh runs and pending approvals. Use this for any question about what actually happened or current business status.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "research_web", description: "Research current public web results when external/current evidence is needed for products, suppliers, brands, markets, images or other questions.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Create a persistent operator approval request for a consequential BharatShop action. Never use this to pretend the action was executed.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List current pending CEO approval requests.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

async function runTool(name: string, args: any) {
  if (name === "inspect_live_business_data") return inspectLiveBusinessData();
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function fallback(question: string, context: any) {
  const q = question.toLowerCase();
  const products = context?.products;
  const orders = context?.orders ?? context?.storefrontOrders;
  const facts: string[] = [];
  if (products?.total != null) facts.push(`Products: ${products.total}`);
  if (orders?.total != null) facts.push(`Orders: ${orders.total}`);
  if (orders?.revenue != null) facts.push(`Revenue: ₹${orders.revenue}`);
  if (orders?.profit != null) facts.push(`Profit: ₹${orders.profit}`);
  if (facts.length) return `I can answer from the dashboard data currently available to me.\n\n${facts.join("\n")}\n\nI cannot safely infer more from this context alone. If you want a factual answer about what an agent actually did, I need live activity/evidence inspection rather than a generic status message.`;
  if (q.includes("order")) return `I can't verify the order status from the supplied dashboard context alone. I will not label an order real, simulated, paid, or ready for supplier purchase without live order evidence.`;
  return `I don't have enough live evidence in the current request to answer that reliably. I won't invent an answer. Ask me to inspect the live BharatShop data and I can report the evidence I find.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: fallback(question, context), mode: "evidence-safe-fallback" });

    let input: any[] = [];
    for (const message of messages) {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = String(message?.content || "").trim();
      if (content) input.push({ role, content });
    }
    if (!input.length || input.at(-1)?.content !== question) input.push({ role: "user", content: question });
    input.push({ role: "user", content: `For this turn, use the following dashboard context as additional evidence only. Do not assume it is complete; inspect live data when the question requires facts: ${JSON.stringify(context).slice(0, 12000)}` });

    let responseData: any = null;
    for (let round = 0; round < 4; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.6-luna", instructions: SYSTEM, input, tools, tool_choice: "auto" }),
      });
      if (!r.ok) return NextResponse.json({ reply: fallback(question, context), mode: "evidence-safe-fallback", warning: `AI provider returned ${r.status}` });
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
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 20000) });
      }
    }

    return NextResponse.json({ reply: String(responseData?.output_text || fallback(question, context)), mode: "ai-ceo-live" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CEO chat failed" }, { status: 500 });
  }
}
