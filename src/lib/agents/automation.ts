import { runStructured } from "./openai";
import type { AgentResult } from "./types";

export async function runAutomationAgent(objective: string, context: Record<string, unknown> = {}, approveActions = false): Promise<AgentResult> {
  const runId = crypto.randomUUID();
  const plan = await runStructured<{
    trigger: { type: string; condition: string };
    steps: Array<{ id: string; action: string; tool: string; input: Record<string, unknown>; requiresApproval: boolean }>;
    outputs: string[];
    safety: string[];
  }>(
    "You are BharatShop Automation Agent. Operate like an agentic workflow builder: convert a natural-language business objective into a multi-step workflow with triggers, tool calls, branching-ready steps, outputs and safety checks. Actions that modify products, campaigns, orders, spending or external systems must require approval unless the request explicitly grants approval. Never fabricate execution results.",
    JSON.stringify({ objective, context, approveActions })
  );
  const executable = approveActions ? plan.steps : plan.steps.map((step) => ({ ...step, requiresApproval: true }));
  return {
    agent: "automation", runId, status: executable.some((s) => s.requiresApproval) && !approveActions ? "needs_input" : "completed",
    summary: `Built workflow with ${executable.length} steps`,
    steps: [{ tool: "automation_plan", status: "completed", output: { trigger: plan.trigger, steps: executable, safety: plan.safety } }],
    output: { ...plan, steps: executable, executed: false, approvalRequired: !approveActions },
  };
}
