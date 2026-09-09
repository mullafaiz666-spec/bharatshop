import { runStructured } from "./openai";
import type { AgentResult } from "./types";
import { agentPrompt } from "./contracts";

export async function runAutomationAgent(objective: string, context: Record<string, unknown> = {}, approveActions = false): Promise<AgentResult> {
  const runId = crypto.randomUUID();
  const plan = await runStructured<{
    trigger: { type: string; condition: string };
    steps: Array<{ id: string; action: string; tool: string; input: Record<string, unknown>; requiresApproval: boolean }>;
    outputs: string[];
    safety: string[];
  }>(agentPrompt("automation"), JSON.stringify({ objective, context, approveActions }));
  const consequential = /spend|refund|payout|purchase|credential|delete|drop|reset|truncate|external/i;
  const executable = plan.steps.map((step) => ({
    ...step,
    requiresApproval: step.requiresApproval || consequential.test(`${step.action} ${step.tool}`) || !approveActions,
  }));
  return {
    agent: "automation", runId, status: executable.some((s) => s.requiresApproval) && !approveActions ? "needs_input" : "completed",
    summary: `Built workflow with ${executable.length} steps`,
    steps: [{ tool: "automation_plan", status: "completed", output: { trigger: plan.trigger, steps: executable, safety: plan.safety } }],
    output: { ...plan, steps: executable, executed: false, approvalRequired: executable.some(s => s.requiresApproval), promptVersion: "agent-suite-v2" },
  };
}
