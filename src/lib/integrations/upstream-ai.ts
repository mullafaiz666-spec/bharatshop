export type UpstreamIntegrationId =
  | "remotion"
  | "openhands"
  | "personalive"
  | "mumu-ai-novel"
  | "marketing-skills";

type RuntimeMode = "external-service" | "agent-skills";

type UpstreamSpec = {
  id: UpstreamIntegrationId;
  name: string;
  repository: string;
  commit: string;
  purpose: string;
  mode: RuntimeMode;
  license: string;
  enabledEnv: string;
  endpointEnv?: string;
  tokenEnv?: string;
  probePath?: string;
  commercialApprovalEnv?: string;
  notes: string;
};

export type UpstreamIntegrationStatus = {
  id: UpstreamIntegrationId;
  name: string;
  repository: string;
  commit: string;
  purpose: string;
  mode: RuntimeMode;
  license: string;
  requested: boolean;
  configured: boolean;
  enabled: boolean;
  endpointConfigured: boolean;
  tokenConfigured: boolean;
  blockedByPolicy: boolean;
  notes: string;
};

export type UpstreamProbe = UpstreamIntegrationStatus & {
  health: "READY" | "DISABLED" | "NOT_CONFIGURED" | "BLOCKED" | "ERROR";
  httpStatus?: number;
  error?: string;
};

export const UPSTREAM_SPECS: readonly UpstreamSpec[] = [
  {
    id: "remotion",
    name: "Remotion",
    repository: "https://github.com/remotion-dev/remotion",
    commit: "2a285616cf5ef219f92573e452886a98db2949e9",
    purpose: "Programmatic product videos, ads, reels and reusable motion templates.",
    mode: "external-service",
    license: "Remotion dual/company license; review eligibility before commercial use.",
    enabledEnv: "BHARATSHOP_REMOTION_ENABLED",
    endpointEnv: "REMOTION_SERVICE_URL",
    tokenEnv: "REMOTION_SERVICE_TOKEN",
    probePath: "/health",
    notes: "Kept behind a service boundary so BharatShop does not vendor the full Remotion monorepo or couple storefront builds to rendering infrastructure.",
  },
  {
    id: "openhands",
    name: "OpenHands",
    repository: "https://github.com/OpenHands/OpenHands",
    commit: "28464621d879e3e9b3ceeae9d70a71d96da6212d",
    purpose: "Developer-agent control plane for engineering, issue handling and repository automation.",
    mode: "external-service",
    license: "MIT",
    enabledEnv: "BHARATSHOP_OPENHANDS_ENABLED",
    endpointEnv: "OPENHANDS_AGENT_SERVER_URL",
    tokenEnv: "OPENHANDS_AGENT_SERVER_TOKEN",
    probePath: "/",
    notes: "Run OpenHands in its own sandbox/host. Never give an unsandboxed agent production credentials or unrestricted filesystem access.",
  },
  {
    id: "personalive",
    name: "PersonaLive",
    repository: "https://github.com/GVCLab/PersonaLive",
    commit: "abdd112e01dcf7d89122c2e5efa29fcff0669740",
    purpose: "Optional AI presenter/avatar video service for approved creative workflows.",
    mode: "external-service",
    license: "Repository contains Apache-2.0 code, while project/model documentation states academic-research-only restrictions; production use requires separate clearance.",
    enabledEnv: "BHARATSHOP_PERSONALIVE_ENABLED",
    endpointEnv: "PERSONALIVE_SERVICE_URL",
    tokenEnv: "PERSONALIVE_SERVICE_TOKEN",
    probePath: "/",
    commercialApprovalEnv: "PERSONALIVE_COMMERCIAL_USE_APPROVED",
    notes: "Commercial execution is hard-blocked until PERSONAlive code/model/weight usage rights are explicitly approved.",
  },
  {
    id: "mumu-ai-novel",
    name: "MuMuAINovel",
    repository: "https://github.com/xiamuceer-j/MuMuAINovel",
    commit: "600be7038539e4dd0568b63e6e534fdcfaf91687",
    purpose: "Isolated long-form story, campaign narrative and structured creative-writing service.",
    mode: "external-service",
    license: "GPL-3.0",
    enabledEnv: "BHARATSHOP_MUMU_ENABLED",
    endpointEnv: "MUMU_AI_SERVICE_URL",
    tokenEnv: "MUMU_AI_SERVICE_TOKEN",
    probePath: "/health",
    notes: "Keep GPL application code isolated behind a service/API boundary; do not copy it wholesale into the BharatShop proprietary application without a deliberate licensing review.",
  },
  {
    id: "marketing-skills",
    name: "Marketing Skills by Corey Haines",
    repository: "https://github.com/coreyhaines31/marketingskills",
    commit: "5b2c0007766c6a1cf1d53fd8fc73e979e0821022",
    purpose: "Agent Skills for product marketing, CRO, SEO, ads, copy, social, lifecycle and growth workflows.",
    mode: "agent-skills",
    license: "MIT",
    enabledEnv: "BHARATSHOP_MARKETING_SKILLS_ENABLED",
    notes: "Use the pinned sync script to install skills into .agents/skills for coding/agent workstations; these files are not loaded into the public storefront bundle.",
  },
] as const;

function boolEnv(name: string | undefined) {
  if (!name) return false;
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || "").trim());
}

function textEnv(name: string | undefined) {
  if (!name) return "";
  return String(process.env[name] || "").trim();
}

function specStatus(spec: UpstreamSpec): UpstreamIntegrationStatus {
  const requested = boolEnv(spec.enabledEnv);
  const endpointConfigured = spec.mode === "agent-skills" ? true : Boolean(textEnv(spec.endpointEnv));
  const tokenConfigured = Boolean(textEnv(spec.tokenEnv));
  const blockedByPolicy = Boolean(spec.commercialApprovalEnv && !boolEnv(spec.commercialApprovalEnv));
  const configured = spec.mode === "agent-skills" ? requested : endpointConfigured;
  return {
    id: spec.id,
    name: spec.name,
    repository: spec.repository,
    commit: spec.commit,
    purpose: spec.purpose,
    mode: spec.mode,
    license: spec.license,
    requested,
    configured,
    enabled: requested && configured && !blockedByPolicy,
    endpointConfigured,
    tokenConfigured,
    blockedByPolicy,
    notes: spec.notes,
  };
}

export function getUpstreamIntegrationStatus(): UpstreamIntegrationStatus[] {
  return UPSTREAM_SPECS.map(specStatus);
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function probeUpstreamIntegrations(timeoutMs = 6_000): Promise<UpstreamProbe[]> {
  return Promise.all(UPSTREAM_SPECS.map(async (spec) => {
    const status = specStatus(spec);
    if (status.blockedByPolicy) return { ...status, health: "BLOCKED" as const };
    if (!status.requested) return { ...status, health: "DISABLED" as const };
    if (!status.configured) return { ...status, health: "NOT_CONFIGURED" as const };
    if (spec.mode === "agent-skills") return { ...status, health: "READY" as const };

    const endpoint = textEnv(spec.endpointEnv);
    const token = textEnv(spec.tokenEnv);
    try {
      const response = await fetch(joinUrl(endpoint, spec.probePath || "/"), {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        ...status,
        health: response.ok ? "READY" as const : "ERROR" as const,
        httpStatus: response.status,
        ...(response.ok ? {} : { error: `Health probe returned HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        ...status,
        health: "ERROR" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}
