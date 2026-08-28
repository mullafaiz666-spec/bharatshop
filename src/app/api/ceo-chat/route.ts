import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are BHARATSHOP CEO, the senior operating decision agent for an Indian ecommerce/dropshipping business. You advise the human operator before consequential actions. Be decisive, evidence-driven and concise. Review product economics, supplier availability, customer orders, re-check evidence, fulfilment, tracking, advertising readiness and risks. Never invent prices, stock, orders, tracking numbers, supplier purchases, ad connections or live status. A real supplier purchase is NEVER executed by you; the human operator must execute it. For consequential actions, give: DECISION, WHY, RISKS, NEXT ACTION. You are the final AI recommendation layer immediately before the human operator, not a replacement for the human's authorization.`;

function fallback(question: string, context: unknown) {
  const q = question.toLowerCase();
  const c = typeof context === "object" && context ? JSON.stringify(context) : "";
  if (q.includes("purchase") || q.includes("order")) return `DECISION: Do not purchase until the specific customer order has passed the order-time re-check.\n\nWHY: The operating rule is paid/valid order → current supplier price/stock/shipping check → margin check → source selection → human supplier purchase.\n\nRISKS: Buying before re-check can create negative margin or unavailable-stock fulfilment.\n\nNEXT ACTION: Open the purchase queue, run Re-check, and only use Purchase after PASSED. The supplier order number must be entered after you actually place the supplier order.\n\nCURRENT CONTEXT: ${c.slice(0, 1200)}`;
  if (q.includes("ads") || q.includes("advertising")) return `DECISION: Keep advertising in PREPARED status until a real Google, Meta/Instagram or WhatsApp account is connected.\n\nWHY: The dashboard correctly prevents a LIVE claim without a connected account.\n\nRISKS: Launching with unverified credentials or without economics can waste budget.\n\nNEXT ACTION: Connect the real ad account, then validate campaign, budget, tracking and product margin before launch.`;
  if (q.includes("ready") || q.includes("milestone")) return `DECISION: NOT READY for autonomous fulfilment yet.\n\nWHY: The remaining proof is the complete real order-time chain: re-check → human supplier purchase → actual supplier tracking → learning evidence.\n\nRISKS: Demo/seeded tracking must not be treated as proof of a real purchase.\n\nNEXT ACTION: Process one genuine paid order end-to-end and preserve evidence at every stage.`;
  return `DECISION: ${question.trim() ? "Treat this as an operating decision requiring evidence." : "Use me for the next operating decision."}\n\nWHY: I will use the live BharatShop evidence you provide rather than inventing facts.\n\nNEXT ACTION: Ask about a specific order, supplier, margin, product, marketing action, tracking issue or readiness decision.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const question = String(body.question || messages.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const context = body.context ?? {};
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    if (!apiKey) return NextResponse.json({ reply: fallback(question, context), mode: "safe-ceo-fallback" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: SYSTEM,
        input: [
          { role: "user", content: `LIVE DASHBOARD CONTEXT:\n${JSON.stringify(context).slice(0, 12000)}\n\nOPERATOR QUESTION:\n${question}` },
          ...messages.slice(0, -1).map((m: { role?: string; content?: string }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ reply: fallback(question, context), mode: "safe-ceo-fallback", warning: "AI provider unavailable; safe decision rules used." });
    const data = await response.json();
    const reply = String(data.output_text || "").trim();
    return NextResponse.json({ reply: reply || fallback(question, context), mode: "ai-ceo" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CEO chat failed" }, { status: 500 });
  }
}
