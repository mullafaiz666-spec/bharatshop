import { NextResponse } from "next/server";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runWebDesignAgent } from "@/lib/agents/web-design";
import { runAutomationAgent } from "@/lib/agents/automation";
import { publicAgentContracts } from "@/lib/agents/contracts";
import { GOOGLE_INTELLIGENCE_POLICY } from "@/lib/agents/live-intelligence";
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
    suite: "BharatShop Agent Suite v3",
    promptVersion: "agent-suite-v3-google-evidence",
    expertiseStandard: "Every AI agent operates under postgraduate/doctoral-level domain-rigor instructions; the CEO uses masters/MBA-level business leadership, strategy, finance and operations standards. These are reasoning-quality standards, not claims of human academic credentials.",
    intelligence: { provider: "public-google-intelligence", sharedAcrossAgents: true, policy: GOOGLE_INTELLIGENCE_POLICY },
    operationalAgents: publicAgentContracts(),
    workspaceAgents: ["marketing","web-design","automation"],
    learningLoop: "Fresh public Google market context + BharatShop production outcomes -> specialist reasoning -> evidence-backed recommendation/action -> hard gates -> audit log -> future learning.",
    rule: "Specialist operational agents execute through their dedicated endpoints; public trend/news context can prioritize work but cannot replace live source verification. Paid spend, supplier purchases, refunds/payouts, credentials and destructive database actions remain approval-gated.",
  });
}
