import { deepAgentReadiness } from "@/lib/agents/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicInfrastructure(readiness: Awaited<ReturnType<typeof deepAgentReadiness>>) {
  const source = readiness.infrastructure;
  return {
    database: {
      ready: source.database.ready,
      configured: source.database.configured,
      status: source.database.ready ? "READY" : "BLOCKED",
      message: source.database.ready ? "Production PostgreSQL and shared agent state are reachable." : "Production PostgreSQL/shared agent state is unavailable.",
    },
    ai: {
      ready: source.ai.ready,
      configured: source.ai.configured,
      status: source.ai.ready ? "READY" : "BLOCKED",
      message: source.ai.ready ? "The configured AI provider chain passed the live model readiness probe." : "The configured AI provider chain did not pass the live model readiness probe.",
    },
    search: {
      ready: source.search.ready,
      configured: source.search.configured,
      status: source.search.ready ? "READY" : "BLOCKED",
      message: source.search.ready ? "The configured search service passed its live readiness probe." : "The configured search service did not pass its live readiness probe.",
    },
    automation: {
      ready: source.automation.ready,
      configured: source.automation.configured,
      status: source.automation.ready ? "READY" : "BLOCKED",
      message: source.automation.ready ? "Automation authorization is configured." : "Automation authorization is not configured.",
    },
  };
}

export async function GET() {
  try {
    const readiness = await deepAgentReadiness();
    const agents = readiness.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      mission: agent.mission,
      ready: agent.ready,
      status: agent.status,
    }));
    const allOperational = readiness.summary.allReady === true;
    const revision = process.env.BHARATSHOP_BUILD_REVISION || process.env.COMMIT_REF || process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || "unknown";

    return Response.json({
      service: "BharatShop AI Company OS",
      suite: readiness.suite,
      revision,
      provider: readiness.provider,
      verificationMode: "DEEP_LIVE_DEPENDENCY_PROBE",
      allOperational,
      summary: readiness.summary,
      infrastructure: publicInfrastructure(readiness),
      agents,
      commandCentre: "/dashboard/command-centre",
      checkedAt: readiness.checkedAt,
      policy: "This public status endpoint exposes operational readiness only. It does not expose credentials, internal supplier data, approval payloads, model endpoints, tool outputs or private company state.",
    }, {
      status: allOperational ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({
      service: "BharatShop AI Company OS",
      suite: "BharatShop Agent Suite v4",
      revision: process.env.BHARATSHOP_BUILD_REVISION || process.env.COMMIT_REF || process.env.GITHUB_SHA || "unknown",
      verificationMode: "DEEP_LIVE_DEPENDENCY_PROBE",
      allOperational: false,
      summary: { total: 13, ready: 0, blocked: ["readiness-probe"], allReady: false },
      agents: [],
      checkedAt: new Date().toISOString(),
      policy: "Readiness probe failed without exposing internal error details.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
