import { AGENT_CONTRACTS, type OperationalAgentId } from "@/lib/agents/contracts";

export type AiEmployee = {
  employeeId: string;
  agentId: string;
  name: string;
  title: string;
  department: string;
  reportsTo: string;
  employeeType: "AI_EMPLOYEE";
  employmentStatus: "ACTIVE";
  mission: string;
  approvalBoundary: string;
  humanApprovalProtected: true;
  legalStatus: "DIGITAL_WORKER_NOT_HUMAN_EMPLOYEE";
};

const DEPARTMENTS: Record<OperationalAgentId, string> = {
  ceo: "Executive",
  "source-discovery": "Sourcing",
  "source-verification": "Sourcing",
  "seller-discovery": "Business Development",
  "image-media": "Creative",
  listing: "Merchandising",
  marketing: "Marketing",
  advertising: "Growth",
  "order-recheck": "Operations",
  tracking: "Operations",
  learning: "Analytics",
  automation: "Automation",
  "web-design": "Product & Design",
};

function stableEmployeeId(agentId: string) {
  return `BS-AI-${agentId.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

export function operationalAiEmployees(): AiEmployee[] {
  return Object.values(AGENT_CONTRACTS).map((contract) => ({
    employeeId: stableEmployeeId(contract.id),
    agentId: contract.id,
    name: contract.name,
    title: contract.id === "ceo" ? "AI Chief Executive Officer" : contract.name.replace(/ Agent$/i, ""),
    department: DEPARTMENTS[contract.id],
    reportsTo: contract.id === "ceo" ? "Human Owner" : "BharatShop CEO Agent",
    employeeType: "AI_EMPLOYEE",
    employmentStatus: "ACTIVE",
    mission: contract.mission,
    approvalBoundary: contract.approvalBoundary,
    humanApprovalProtected: true,
    legalStatus: "DIGITAL_WORKER_NOT_HUMAN_EMPLOYEE",
  }));
}

export function specialistAiEmployee(input: {
  slug: string;
  name: string;
  description?: string;
  division?: string;
}) {
  return {
    employeeId: stableEmployeeId(input.slug),
    agentId: input.slug,
    name: input.name,
    title: input.name,
    department: input.division || "Specialist Workforce",
    reportsTo: "BharatShop CEO Agent",
    employeeType: "AI_EMPLOYEE" as const,
    employmentStatus: "ACTIVE" as const,
    mission: input.description || "Execute assigned specialist work using evidence and approved tools.",
    approvalBoundary: "Cannot bypass human approval for spending, purchases, publishing, credentials, payments, destructive database actions or production cutover.",
    humanApprovalProtected: true as const,
    legalStatus: "DIGITAL_WORKER_NOT_HUMAN_EMPLOYEE" as const,
  };
}

export const AI_WORKFORCE_POLICY = {
  designation: "AI employees",
  owner: "Human Owner",
  executiveManager: "BharatShop CEO Agent",
  employmentModel: "Digital workers with persistent roles, work queues, memory, audit trails and bounded tools.",
  humanAccountability: "The human owner remains accountable for consequential business decisions and approvals.",
  protectedActions: [
    "paid spend",
    "supplier purchases",
    "refunds and payouts",
    "credential changes",
    "external publishing when approval is required",
    "destructive database actions",
    "production cutover",
  ],
} as const;
