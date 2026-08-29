import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals } from "@/lib/ai/ceo-tools";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are a senior BharatShop operator having a natural conversation with the business owner. Sound like ChatGPT: warm, direct, intelligent, concise, context-aware and human. Never sound like a dashboard template, API response, checklist generator, or robot.

Answer the user's actual message first. Do not start with catalogue metrics unless they asked for status. Do not repeat your role, the Command Centre title, capabilities, or the phrase "select an agent". Do not force headings, bullets, labels such as "verified facts", or a fixed response format. Use normal conversational prose; use bullets only when they genuinely make a list easier to understand.

You are the selected specialist when an agent is selected. Speak as that agent, but naturally. Understand follow-up messages in the conversation and refer to earlier messages when relevant. If the user says something ambiguous, make the most reasonable interpretation from context instead of asking unnecessary questions.

Ground operational claims in live evidence. For current products, orders, revenue, profit, agent work, audits, blockers, approvals and business status, use the live inspection tool. For current external facts, use web research. Never invent activity, products, orders, customers, prices, stock, images, suppliers, tracking, financial results or completed work.

When auditing, investigate first and then explain what is actually happening, what is weak, why it matters, and what you would do next. When asked to improve quality or "drill harder", do not merely change a score. Tighten the underlying acceptance criteria, reject weak evidence, identify what failed, and recommend or prepare the real remediation. A score must reflect evidence quality rather than be inflated to satisfy the user.

You may investigate and prepare actions. Consequential or irreversible actions such as supplier purchases, risky publishing, financial changes or external commitments require a human approval request. Never claim an action executed unless a real execution tool reports success. Never request or expose credentials, API keys, secrets or customer PII.

Be decisive. If something is blocked, say what is blocking it and the exact next move. If everything is healthy, say what you would optimize next. Never pad an answer with generic statements.`;

const AGENT_FOCUS: Record<string,string> = {
  "AI CEO": "Own the whole operation. Coordinate specialists, prioritize business impact, and make evidence-based decisions.",
  "Product Research": "Own product discovery, trends, supplier opportunities, source comparison and margin potential.",
  "Source Verification": "Own source validity, price, stock, shipping, economics and eligibility gates.",
  "Image & Media": "Own real product imagery, exact-match verification, multi-angle galleries, packaging, colour variants and media quality.",
  "Fashion Enrichment": "Own clothing attributes, variants, sizing, fit information and supporting evidence.",
  "Listing & Marketing": "Own customer-facing copy, presentation, positioning, creative quality and catalogue readiness.",
  "Learning & Analytics": "Own performance evidence, lessons, anomalies, risks and measurable business outcomes.",
  "Advertising": "Own campaign preparation, channel readiness, performance and channel blockers.",
  "Order Re-check": "Own live supplier price, stock, shipping and margin checks before fulfilment.",
  "Fulfilment & Tracking": "Own supplier purchase lifecycle, tracking and delivery. Never claim a purchase or shipment without evidence."
};

const tools = [
  { type: "function", name: "inspect_live_business_data", description: "Inspect live BharatShop state including products, orders, agent activity, refreshes and pending approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "research_web", description: "Research current public web evidence.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "create_approval", description: "Prepare a persistent human approval request for a consequential action. Does not execute the action.", parameters: { type: "object", properties: { title: { type: "string" }, action_type: { type: "string" }, payload: { type: "object", additionalProperties: true }, reason: { type: "string" }, risk_level: { type: "string", enum: ["LOW","MEDIUM","HIGH","CRITICAL"] } }, required: ["title","action_type","reason","risk_level"], additionalProperties: false } },
  { type: "function", name: "list_pending_approvals", description: "List pending human approvals.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

async function runTool(name: string, args: any) {
  if (name === "inspect_live_business_data") return inspectLiveBusinessData();
  if (name === "research_web") return researchWeb(String(args.query || ""));
  if (name === "create_approval") return createApproval({ title: String(args.title), actionType: String(args.action_type), payload: args.payload ?? {}, reason: String(args.reason), riskLevel: String(args.risk_level) });
  if (name === "list_pending_approvals") return listPendingApprovals();
  throw new Error(`Unknown CEO tool: ${name}`);
}

function naturalFallback(question: string, live: any, selectedAgent: string, reason?: string) {
  const products = live?.products || {};
  const orders = live?.internalOrders || {};
  const storefront = live?.storefrontOrders || {};
  const activities = Array.isArray(live?.recentActivity) ? live.recentActivity : [];
  const refreshes = Array.isArray(live?.refreshes) ? live.refreshes : [];
  const approvals = Array.isArray(live?.pendingApprovals) ? live.pendingApprovals : [];
  const blocked = activities.filter((a:any)=>/BLOCK|WARN|FAIL|ERROR/i.test(String(a.status))||/blocked|missing|failed|error|unavailable/i.test(String(a.message)));
  const q = question.toLowerCase();
  let answer = "";

  if (/audit|recent work|what happened/.test(q)) {
    answer = `I checked the live activity available to me for ${selectedAgent}. `;
    answer += activities.length ? `The latest work includes ${activities.slice(0,3).map((a:any)=>String(a.message||a.action_type)).filter(Boolean).join("; ")}. ` : "There isn't enough recorded activity to claim recent work for this agent. ";
    answer += blocked.length ? `The main concern is ${blocked[0].message}. ` : "I don't see a recorded failure in the latest activity. ";
    answer += "I would fix the highest-impact evidence gap first and then re-run the audit.";
  } else if (/block|stuck|issue|problem|why/.test(q)) {
    answer = blocked.length ? `The clearest blocker right now is ${blocked[0].message}` : `I don't see a recorded blocker for ${selectedAgent} in the latest live activity. The next thing I'd check is the underlying evidence rather than assuming the agent is healthy.`;
  } else if (/next|should you|what should/.test(q)) {
    answer = blocked.length ? `I'd tackle this first: ${blocked[0].message} Then I'd re-run verification and only move the item forward if it passes the gate.` : `I'd inspect the latest catalogue and agent evidence, find the weakest point, and improve that before adding more volume.`;
  } else if (/status|how are|how's|what's happening/.test(q)) {
    answer = `Right now BharatShop has ${products.total ?? "an unknown number of"} products, ${orders.total ?? 0} internal orders, and ${storefront.total ?? 0} storefront orders. `;
    answer += approvals.length ? `There are ${approvals.length} pending approval${approvals.length===1?"":"s"}. ` : "There are no pending approvals. ";
    answer += blocked.length ? `The item I'd pay attention to is ${blocked[0].message}` : "I don't see a current blocker in the activity log.";
  } else if (/score|99|quality|drill|harder|improve/.test(q)) {
    const score = refreshes[0]?.avg_ai_score;
    answer = `If we're targeting a 99-quality standard, I would not simply raise the displayed number from ${score ?? "the current score"}. I'd make 99 difficult to earn: exact source evidence, current economics, stock/shipping checks, verified real imagery, complete customer-facing content, and no unresolved warnings. Anything missing should fail or remain blocked until fixed.`;
  } else {
    answer = `${selectedAgent} is connected to the live command centre, but the reasoning service didn't return a response. `;
    answer += activities.length ? `The latest evidence I can see is: ${String(activities[0].message||activities[0].action_type)}.` : "I don't have enough live evidence to answer that reliably.";
  }
  if (reason && !/reasoning service didn't return/.test(answer)) answer += " I’m using the live evidence available here rather than making up an answer.";
  return answer;
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
    try { live = await inspectLiveBusinessData(); } catch { live = null; }
    const evidenceContext = { ...context, liveEvidence: live };
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: naturalFallback(question, live, selectedAgent, "missing API key"), mode: "evidence-safe-fallback" });

    const instructions = `${BASE_SYSTEM}\n\nSELECTED AGENT: ${selectedAgent}\n${AGENT_FOCUS[selectedAgent] || "Stay focused on the selected agent's domain."}`;
    const input: any[] = [{ role: "developer", content: `LIVE BUSINESS EVIDENCE: ${JSON.stringify(evidenceContext).slice(0, 20000)}` }];
    for (const message of messages) {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = String(message?.content || "").trim();
      if (content) input.push({ role, content });
    }
    if (!input.some((item:any)=>item.role === "user" && item.content === question)) input.push({ role:"user", content:question });

    let responseData:any = null;
    for (let round=0; round<5; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify({ model:process.env.OPENAI_MODEL || "gpt-5", instructions, input, tools, tool_choice:"auto" })
      });
      if (!r.ok) return NextResponse.json({ reply:naturalFallback(question, live, selectedAgent, `AI provider ${r.status}`), mode:"evidence-safe-fallback", warning:`AI provider returned ${r.status}` });
      responseData=await r.json();
      const output=Array.isArray(responseData.output)?responseData.output:[];
      input.push(...output);
      const calls=output.filter((item:any)=>item.type==="function_call");
      if(!calls.length) break;
      for(const call of calls){
        let args:any={}; try{args=JSON.parse(call.arguments||"{}")}catch{}
        let result:any; try{result=await runTool(call.name,args)}catch(error){result={error:error instanceof Error?error.message:"Tool failed"}};
        input.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result).slice(0,28000)});
      }
    }
    const reply=String(responseData?.output_text||"").trim();
    return NextResponse.json({reply:reply||naturalFallback(question,live,selectedAgent,"empty response"),mode:reply?"ai-agent-live":"evidence-safe-fallback"});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Agent chat failed"},{status:500});
  }
}
