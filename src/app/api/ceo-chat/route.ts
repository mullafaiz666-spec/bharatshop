import { NextResponse } from "next/server";
import { runAgentRuntime, type RuntimeMessage } from "@/lib/agents/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      question?: string;
      objective?: string;
      messages?: RuntimeMessage[];
      history?: RuntimeMessage[];
      context?: Record<string, unknown> & { selectedAgent?: string };
      sessionId?: string;
      maxSteps?: number;
    };
    const incoming = Array.isArray(body.messages) ? body.messages : Array.isArray(body.history) ? body.history : [];
    const question = String(body.question || body.objective || incoming.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });

    const context = body.context ?? {};
    const result = await runAgentRuntime({
      agent: String(context.selectedAgent || "ceo"),
      objective: question,
      history: incoming,
      context,
      sessionId: body.sessionId,
      origin: new URL(req.url).origin,
      maxSteps: body.maxSteps,
    });

    return NextResponse.json({
      ...result,
      mode: result.modelStatus === "live" ? "ai-agent-live" : "ai-agent-unavailable",
    }, { status: result.modelStatus === "unavailable" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Agent chat failed",
      code: "CEO_CHAT_FAILED",
    }, { status: 500 });
  }
}
