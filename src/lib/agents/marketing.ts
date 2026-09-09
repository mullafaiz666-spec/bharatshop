import { runStructured } from "./openai";
import type { AgentResult } from "./types";
import { agentPrompt } from "./contracts";

export async function runMarketingAgent(objective: string, context: Record<string, unknown> = {}): Promise<AgentResult> {
  const runId = crypto.randomUUID();
  const result = await runStructured<{
    brandDna: { positioning: string; tone: string[]; audience: string[]; colors: string[]; visualRules: string[] };
    campaign: { concept: string; channels: string[]; hooks: string[]; cta: string };
    copy: { headline: string; primaryText: string; captions: string[] };
    creativeBrief: { formats: string[]; scenes: string[]; imagePrompts: string[] };
  }>(agentPrompt("marketing"), JSON.stringify({ objective, context }));
  return {
    agent: "marketing", runId, status: "completed",
    summary: result.campaign.concept,
    steps: [
      { tool: "brand_dna", status: "completed", output: result.brandDna },
      { tool: "campaign_plan", status: "completed", output: result.campaign },
      { tool: "marketing_copy", status: "completed", output: result.copy },
      { tool: "creative_brief", status: "completed", output: result.creativeBrief },
    ],
    output: { ...result, promptVersion: "agent-suite-v2" },
  };
}
