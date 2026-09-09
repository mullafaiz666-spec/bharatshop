import { NextResponse } from "next/server";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runWebDesignAgent } from "@/lib/agents/web-design";
import { runAutomationAgent } from "@/lib/agents/automation";
import { publicAgentContracts } from "@/lib/agents/contracts";
import type { AgentName } from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agent?: AgentName; objective?: string; context?: Record<string, unknown>; approveActions?: boolean };
    if (!body.agent || !body.objective?.trim()) return NextResponse.json({ error: "agent and objective are required" }, { status: 400 });
    const context = body.context ?? {};
    const result = body.agent === "marketing" ? await runMarketingAgent(body.objective, context)
      : body.agent === "web-design" ? await runWebDesignAgent(body.objective, context)
      : await runAutomationAgent(body.objective, context, body.approveActions === true);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    suite: "BharatShop Agent Suite v2",
    promptVersion: "agent-suite-v2",
    operationalAgents: publicAgentContracts(),
    workspaceAgents: ["marketing","web-design","automation"],
    rule: "Specialist operational agents execute through their dedicated endpoints; paid spend, supplier purchases, refunds/payouts, credentials and destructive database actions remain approval-gated.",
  });
}
