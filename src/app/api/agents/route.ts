import { NextResponse } from "next/server";
import { publicAgentContracts } from "@/lib/agents/contracts";
import { GOOGLE_INTELLIGENCE_POLICY } from "@/lib/agents/live-intelligence";
import { agentRuntimeCatalog, runAgentRuntime, type RuntimeMessage } from "@/lib/agents/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      agent?: string;
      objective?: string;
      question?: string;
      messages?: RuntimeMessage[];
      history?: RuntimeMessage[];
      context?: Record<string, unknown>;
      sessionId?: string;
      maxSteps?: number;
    };
    const objective = String(body.objective || body.question || "").trim();
    if (!objective) return NextResponse.json({ error: "objective is required" }, { status: 400 });

    const result = await runAgentRuntime({
      agent: body.agent || "ceo",
      objective,
      history: Array.isArray(body.history) ? body.history : Array.isArray(body.messages) ? body.messages : [],
      context: body.context ?? {},
      sessionId: body.sessionId,
      origin: new URL(request.url).origin,
      maxSteps: body.maxSteps,
    });
    return NextResponse.json(result, { status: result.modelStatus === "unavailable" ? 503 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed";
    return NextResponse.json({ error: message, code: "AGENT_RUNTIME_FAILED" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    suite: "BharatShop Agent Suite v4",
    promptVersion: "agent-runtime-v4",
    orchestration: "multi-step plan -> tool -> observe -> continue -> answer, with bounded specialist handoffs",
    memory: "PostgreSQL session memory with request-history fallback",
    intelligence: { provider: "local OpenAI-compatible Gemma + verified BharatShop/public evidence tools", sharedAcrossAgents: true, policy: GOOGLE_INTELLIGENCE_POLICY },
    operationalAgents: publicAgentContracts(),
    runtimeAgents: agentRuntimeCatalog(),
    rule: "Every agent is conversational and tool-using. No agent may fabricate execution. Paid spend, supplier purchases, refunds/payouts, credentials and destructive database actions remain human-approval gated.",
  });
}
