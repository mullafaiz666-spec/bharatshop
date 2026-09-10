import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";
import { runAgentRuntime } from "@/lib/agents/runtime";
import {
  completeWorkItem,
  createCompanyGoal,
  queueAgentWork,
  recordSharedEvent,
  sharedAgentContext,
  type AgentWorkItem,
} from "@/lib/agents/company-state";

const GROWTH_WORK: Array<{ agentId: OperationalAgentId; title: string; priority: number; instruction: string }> = [
  { agentId: "source-discovery", title: "Find profitable sourcing opportunities", priority: 88, instruction: "Inspect current catalog and fresh market evidence. Identify the strongest safe sourcing opportunities and gaps that can improve contribution margin without inventing supplier facts." },
  { agentId: "source-verification", title: "Verify sourcing and economics blockers", priority: 86, instruction: "Review the current catalog/source evidence and identify which products or source decisions are READY, HOLD or BLOCKED under live price, stock, shipping, policy and margin gates." },
  { agentId: "seller-discovery", title: "Expand direct supplier pipeline", priority: 72, instruction: "Research relevant independent brands, wholesalers and direct suppliers that fit the company objective. Return only source-backed leads; never invent contact details or terms." },
  { agentId: "listing", title: "Improve listing and creative readiness", priority: 78, instruction: "Inspect verified catalog items and identify concrete listing, media or merchandising work that can improve customer conversion while preserving source/media/economics gates." },
  { agentId: "marketing", title: "Build organic growth actions", priority: 82, instruction: "Use verified catalog and current evidence to propose channel-ready organic growth actions. Separate estimates from measured performance and avoid false claims." },
  { agentId: "advertising", title: "Protect acquisition economics", priority: 68, instruction: "Inspect current contribution economics and campaign readiness. Recommend only bounded tests; paid activation remains human-approved and new external campaigns remain PAUSED." },
  { agentId: "order-recheck", title: "Audit fulfilment readiness", priority: 75, instruction: "Inspect current business/order context and surface any fulfilment readiness, price, stock, shipping or margin exceptions. Do not authorize supplier purchase." },
  { agentId: "tracking", title: "Surface logistics exceptions", priority: 64, instruction: "Inspect current order lifecycle evidence and identify tracking or delivery exceptions. Never fabricate carrier status or tracking identifiers." },
  { agentId: "learning", title: "Extract growth lessons", priority: 80, instruction: "Analyze recorded operational outcomes and identify evidence-backed lessons that can improve profitability, conversion, sourcing quality, RTO or returns. Do not weaken hard gates." },
  { agentId: "automation", title: "Improve autonomous workflows", priority: 76, instruction: "Inspect company operations and propose bounded, idempotent automation improvements with explicit preconditions, failure paths and audit outputs. Consequential writes stay approval-gated." },
  { agentId: "web-design", title: "Improve storefront conversion", priority: 70, instruction: "Review real catalog/storefront context and identify mobile-first UX or conversion improvements that preserve checkout, truthful media, accessibility and backend contracts." },
];

function outcomeStatus(reply: string, completed: boolean) {
  if (!completed) return "FAILED";
  const text = reply.toUpperCase();
  if (/APPROVAL_REQUIRED|APPROVAL REQUIRED/.test(text)) return "APPROVAL_REQUIRED";
  if (/\bBLOCKED\b/.test(text)) return "BLOCKED";
  if (/\bHOLD\b/.test(text)) return "HOLD";
  return "READY";
}

function summarize(text: string, max = 600) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

export async function executeCompanyWorkItem(item: AgentWorkItem, origin: string) {
  const shared = await sharedAgentContext(item.goal_id, 18);
  try {
    const result = await runAgentRuntime({
      agent: item.agent_id,
      objective: item.objective,
      context: {
        companyGoalId: item.goal_id,
        companyWorkItemId: item.id,
        sharedCompanyContext: shared,
        workInput: item.input || {},
      },
      sessionId: `company:${item.goal_id || "general"}:${item.agent_id}`,
      origin,
      maxSteps: 3,
    });
    const status = outcomeStatus(result.reply, result.status === "completed");
    const output = {
      reply: result.reply,
      runtimeStatus: result.status,
      modelStatus: result.modelStatus,
      provider: result.provider,
      model: result.model,
      handoffs: result.handoffs,
      toolExecutions: result.toolExecutions.map((trace) => ({
        step: trace.step,
        kind: trace.kind,
        tool: trace.tool,
        status: trace.status,
        durationMs: trace.durationMs,
        auditId: trace.auditId,
      })),
      completedAt: new Date().toISOString(),
    };
    const saved = await completeWorkItem(item.id, { status, runId: result.runId, output });
    await recordSharedEvent({
      goalId: item.goal_id,
      workItemId: item.id,
      agentId: item.agent_id,
      eventType: "AGENT_WORK_COMPLETED",
      status,
      summary: summarize(result.reply),
      evidence: {
        runId: result.runId,
        tools: result.toolExecutions.filter((x) => x.kind === "tool" || x.kind === "handoff").map((x) => ({ tool: x.tool, status: x.status, auditId: x.auditId })),
        handoffs: result.handoffs,
      },
    });
    return { item: saved, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const saved = await completeWorkItem(item.id, { status: "FAILED", output: { error: message, failedAt: new Date().toISOString() } });
    await recordSharedEvent({
      goalId: item.goal_id,
      workItemId: item.id,
      agentId: item.agent_id,
      eventType: "AGENT_WORK_FAILED",
      status: "FAILED",
      summary: `${AGENT_CONTRACTS[item.agent_id].name} could not complete the queued work: ${summarize(message, 420)}`,
      evidence: { error: message.slice(0, 1000) },
    });
    return { item: saved, error: message };
  }
}

export async function createGrowthCycle(input: { objective: string; title?: string; createdBy?: number | null; origin: string }) {
  const objective = String(input.objective || "").trim();
  if (!objective) throw new Error("Growth objective is required");
  const goal = await createCompanyGoal({
    title: input.title || "BharatShop coordinated growth cycle",
    objective,
    createdBy: input.createdBy ?? null,
    priority: 90,
  });

  const ceoQueued = await queueAgentWork({
    goalId: goal.id,
    agentId: "ceo",
    title: "Set company direction and priorities",
    objective: `Company objective: ${objective}\n\nInspect current BharatShop business evidence. Set the immediate priorities for the specialist team, identify hard blockers/approval boundaries, and define what measurable progress should look like. Delegate with evidence; do not invent execution.`,
    priority: 100,
    createdBy: input.createdBy ?? null,
  });
  const { startWorkItem } = await import("@/lib/agents/company-state");
  const ceoWork = await startWorkItem(ceoQueued.id);
  const ceoResult = ceoWork ? await executeCompanyWorkItem(ceoWork, input.origin) : null;

  const queued: AgentWorkItem[] = [];
  for (const plan of GROWTH_WORK) {
    queued.push(await queueAgentWork({
      goalId: goal.id,
      agentId: plan.agentId,
      title: plan.title,
      objective: `Company objective: ${objective}\n\nYour specialist assignment: ${plan.instruction}\n\nUse the shared company context from the CEO and other completed agents. Return concrete evidence-backed actions or a truthful HOLD/BLOCKED state.`,
      priority: plan.priority,
      createdBy: input.createdBy ?? null,
      data: { coordinatedGrowthCycle: true },
    }));
  }

  await recordSharedEvent({
    goalId: goal.id,
    agentId: "ceo",
    eventType: "GROWTH_CYCLE_QUEUED",
    status: "READY",
    summary: `Coordinated company goal created. CEO direction completed/attempted and ${queued.length} specialist work items were queued on the shared PostgreSQL work bus.`,
    evidence: { queuedAgents: queued.map((x) => x.agent_id), ceoWorkItemId: ceoQueued.id },
  });
  return { goal, ceo: ceoResult, queued };
}

export function growthWorkCatalog() {
  return GROWTH_WORK.map((item) => ({ ...item, contract: AGENT_CONTRACTS[item.agentId].mission }));
}
