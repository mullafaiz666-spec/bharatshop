import { NextResponse } from "next/server";
import { createApproval, researchWeb, listPendingApprovals } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const SYSTEM = `You are BHARATSHOP AI CEO. Operate like a capable senior operator: understand the user's request, inspect available business evidence, use tools when useful, and give a clear answer like ChatGPT. Separate VERIFIED FACTS, INFERENCE and RECOMMENDATION when it matters. Never invent product facts, prices, stock, images, supplier identity, orders, tracking or financial results. You can research the web and create an approval request. You cannot directly perform irreversible or financially consequential actions. For those, create an approval request and tell the operator exactly what will happen, why, risks and what evidence supports it. Do not ask for credentials or secrets in chat. Never expose API keys or internal tokens. Prefer Indian market context when researching BharatShop.`;

const tools = [
  { type: "function", name: "research_web", description: "Research current public web results for a product, supplier, brand, market opportunity, image/source issue or other question. Use when current evidence is needed.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Create a persistent operator approval request for a consequential BharatShop action. Use instead of performing purchases, publishing risky products, sharing contact details, changing important settings, or other irreversible actions.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List the current pending CEO approval requests.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

async function runTool(name: string, args: any) {
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function fallback(question: string, context: unknown) {
  const q = question.toLowerCase();
  if (q.includes("purchase") || q.includes("order")) return `DECISION: Do not purchase until the specific order has passed the current re-check.\n\nWHY: Supplier price, stock, shipping and margin can change.\n\nNEXT ACTION: Run the order-time re-check and use the CEO approval queue before any consequential supplier purchase.`;
  return `I’m your BHARATSHOP AI CEO. I can investigate the live dashboard context, research current web evidence, and prepare actions for your approval. If something is consequential, I will put it into the approval queue rather than pretending I executed it.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: fallback(question, context), mode: "safe-ceo-fallback" });

    let input: any[] = [{ role: "user", content: `LIVE DASHBOARD CONTEXT:\n${JSON.stringify(context).slice(0, 14000)}\n\nOPERATOR QUESTION:\n${question}` }];
    let responseData: any = null;

    for (let round = 0; round < 4; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.6-luna", instructions: SYSTEM, input, tools, tool_choice: "auto" }),
      });
      if (!r.ok) return NextResponse.json({ reply: fallback(question, context), mode: "safe-ceo-fallback", warning: `AI provider returned ${r.status}` });
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
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 16000) });
      }
    }

    return NextResponse.json({ reply: String(responseData?.output_text || fallback(question, context)), mode: "ai-ceo-tools" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CEO chat failed" }, { status: 500 });
  }
}
