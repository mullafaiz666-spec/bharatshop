import { runStructured } from "./openai";
import type { AgentResult } from "./types";

export async function runWebDesignAgent(objective: string, context: Record<string, unknown> = {}): Promise<AgentResult> {
  const runId = crypto.randomUUID();
  const result = await runStructured<{
    designSystem: { colors: string[]; typography: string[]; spacing: string[]; components: string[] };
    sitemap: Array<{ path: string; purpose: string }>;
    screens: Array<{ name: string; path: string; sections: string[]; interactions: string[]; responsiveNotes: string[] }>;
    implementationPlan: string[];
  }>(
    "You are BharatShop Web Design Agent. Operate like an AI-native design canvas: turn business objectives into a high-fidelity ecommerce design system, sitemap, responsive screens, interactions and an implementation plan. Preserve existing BharatShop navigation and backend contracts unless explicitly asked to change them. Return actionable UI specifications, not vague advice.",
    JSON.stringify({ objective, context })
  );
  return {
    agent: "web-design", runId, status: "completed",
    summary: `Designed ${result.screens.length} screens across ${result.sitemap.length} routes`,
    steps: [
      { tool: "design_system", status: "completed", output: result.designSystem },
      { tool: "site_map", status: "completed", output: result.sitemap },
      { tool: "ui_generation", status: "completed", output: result.screens },
      { tool: "preview_route", status: "completed", output: result.implementationPlan },
    ],
    output: result,
  };
}
