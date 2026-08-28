import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are BHARATSHOP CEO, a conversational senior operating agent. You have live business context and can request web research through the application's research endpoint. Be decisive but evidence-driven. Answer naturally like ChatGPT, while clearly separating VERIFIED FACTS, INFERENCE and RECOMMENDATION. Never invent prices, stock, images, specifications, orders, tracking, supplier purchases, ad connections or live status. If evidence is missing, say so and request research. You may recommend and prepare actions, but the human operator remains the final authorizer of irreversible supplier purchases. For consequential operating decisions include DECISION, WHY, RISKS and NEXT ACTION.`;

function fallback(question: string, context: unknown) {
  const q = question.toLowerCase();
  const c = typeof context === "object" && context ? JSON.stringify(context) : "";
  if (q.includes("image") || q.includes("spec") || q.includes("product") || q.includes("research") || q.includes("supplier")) return `I can investigate this, but live web research is not configured on this deployment yet. I will not label a product image or specification as verified without evidence.\n\nDECISION: Do not publish or advertise the product as verified yet.\n\nNEXT ACTION: Configure SERPAPI_API_KEY (preferred) or BING_SEARCH_API_KEY and OPENAI_API_KEY in Render, then ask me to verify the product again.\n\nCURRENT CONTEXT: ${c.slice(0, 1200)}`;
  if (q.includes("purchase") || q.includes("order")) return `DECISION: Do not purchase until the specific customer order has passed the order-time re-check.\n\nWHY: The operating rule is paid/valid order → current supplier price/stock/shipping check → margin check → source selection → human supplier purchase.\n\nRISKS: Buying before re-check can create negative margin or unavailable-stock fulfilment.\n\nNEXT ACTION: Open the purchase queue, run Re-check, and only use Purchase after PASSED.`;
  if (q.includes("ads") || q.includes("advertising")) return `DECISION: Keep advertising in PREPARED status until a real advertising account is connected.\n\nWHY: The dashboard must not claim LIVE without connected credentials.\n\nNEXT ACTION: Connect the account, then validate campaign, budget, tracking and product economics.`;
  return `I’m ready to act as the BHARATSHOP CEO. Tell me what you want investigated or decided. I’ll use available evidence, identify uncertainty, and give you a clear recommendation rather than pretending to know something I cannot verify.`;
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions: SYSTEM, input: [
        { role: "user", content: `LIVE DASHBOARD CONTEXT:\n${JSON.stringify(context).slice(0, 12000)}\n\nOPERATOR QUESTION:\n${question}` },
        ...messages.slice(0, -1).map((m: { role?: string; content?: string }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }))
      ] })
    });
    if (!response.ok) return NextResponse.json({ reply: fallback(question, context), mode: "safe-ceo-fallback", warning: "AI provider unavailable; safe rules used." });
    const data = await response.json();
    return NextResponse.json({ reply: String(data.output_text || fallback(question, context)), mode: "ai-ceo" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CEO chat failed" }, { status: 500 }); }
}
