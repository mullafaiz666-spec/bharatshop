import { NextResponse } from "next/server";
import { publicAgentContracts } from "@/lib/agents/contracts";
import { GOOGLE_INTELLIGENCE_POLICY } from "@/lib/agents/live-intelligence";
import { agentRuntimeCatalog, runAgentRuntime, type RuntimeMessage } from "@/lib/agents/runtime";
import { runCompactAgentFallback } from "@/lib/agents/compact-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function compatibleTrace(items: unknown[]) {
  return items.map((item) => {
    const trace = item && typeof item === "object" ? item as Record<string, unknown> : { result: item };
    return { ...trace, result: trace.result !== undefined ? trace.result : trace.output };
  });
}

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

    const primary = await runAgentRuntime({
      agent: body.agent || "ceo",
      objective,
      history: Array.isArray(body.history) ? body.history : Array.isArray(body.messages) ? body.messages : [],
      context: body.context ?? {},
      sessionId: body.sessionId,
      origin: new URL(request.url).origin,
      maxSteps: body.maxSteps,
    });

    if (primary.modelStatus === "live") {
      return NextResponse.json({ ...primary, toolExecutions: compatibleTrace(primary.toolExecutions as unknown[]) });
    }

    const compact = await runCompactAgentFallback({
      agentId: primary.agentId,
      objective,
      sessionId: primary.sessionId,
      context: body.context ?? {},
      priorError: primary.modelError,
    });
    const result = {
      ...compact,
      toolExecutions: [
        ...compatibleTrace(primary.toolExecutions as unknown[]),
        ...compatibleTrace(compact.toolExecutions as unknown[]),
      ],
      fullRuntimeStatus: primary.status,
      compactRecovery: compact.modelStatus === "live" ? "RECOVERED" : "FAILED",
    };
    return NextResponse.json(result, { status: compact.modelStatus === "unavailable" ? 503 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed";
    return NextResponse.json({ error: message, code: "AGENT_RUNTIME_FAILED" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    suite: "BharatShop Agent Suite v4",
    promptVersion: "agent-runtime-v4",
    orchestration: "multi-step plan -> tool -> observe -> continue -> answer, with compact evidence-reason recovery for small local models",
    memory: "PostgreSQL session memory with request-history fallback",
    intelligence: { provider: "local OpenAI-compatible Gemma + verified BharatShop/public evidence tools", sharedAcrossAgents: true, policy: GOOGLE_INTELLIGENCE_POLICY },
    operationalAgents: publicAgentContracts(),
    runtimeAgents: agentRuntimeCatalog(),
    rule: "Every agent is conversational and evidence-backed. Full tool-calling is attempted first; a compact evidence workflow recovers when the free local model cannot carry the full schema. No agent may fabricate execution. Paid spend, supplier purchases, refunds/payouts, credentials and destructive database actions remain human-approval gated.",
  });
}
