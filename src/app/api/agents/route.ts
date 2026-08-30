import { NextResponse } from "next/server";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runWebDesignAgent } from "@/lib/agents/web-design";
import { runAutomationAgent } from "@/lib/agents/automation";
import type { AgentName } from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agent?: AgentName; objective?: string; context?: Record<string, unknown>; approveActions?: boolean };
    if (!body.agent || !body.objective?.trim()) return NextResponse.json({ error: "agent and objective are required" }, { status: 400 });
    const context = body.context ?? {};
    const result = body.agent === "marketing"
      ? await runMarketingAgent(body.objective, context)
      : body.agent === "web-design"
        ? await runWebDesignAgent(body.objective, context)
        : await runAutomationAgent(body.objective, context, body.approveActions === true);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    agents: [
      { id: "marketing", name: "BharatShop Marketing", mode: "brand-aware campaign generation", tools: ["brand_dna", "campaign_plan", "marketing_copy", "creative_brief"] },
      { id: "web-design", name: "BharatShop Web Designer", mode: "AI design canvas", tools: ["design_system", "site_map", "ui_generation", "preview_route"] },
      { id: "automation", name: "BharatShop Automation", mode: "agentic workflow execution", tools: ["automation_plan", "automation_execute", "catalog_query", "product_update", "campaign_create"] },
    ],
  });
}
