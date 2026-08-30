export type AgentName = "marketing" | "web-design" | "automation";

export type ToolName =
  | "brand_dna"
  | "campaign_plan"
  | "marketing_copy"
  | "creative_brief"
  | "design_system"
  | "site_map"
  | "ui_generation"
  | "preview_route"
  | "automation_plan"
  | "automation_execute"
  | "catalog_query"
  | "product_update"
  | "campaign_create";

export type AgentRequest = {
  agent: AgentName;
  objective: string;
  context?: Record<string, unknown>;
  approveActions?: boolean;
};

export type AgentResult = {
  agent: AgentName;
  runId: string;
  status: "completed" | "needs_input" | "failed";
  summary: string;
  steps: Array<{ tool: ToolName; status: "completed" | "skipped" | "failed"; output?: unknown }>;
  output: Record<string, unknown>;
};
