import { NextResponse } from "next/server";
import { configuredAgentReadiness, deepAgentReadiness } from "@/lib/agents/readiness";
import { marketingConnections } from "@/lib/marketing/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = ["1", "true", "yes"].includes(String(url.searchParams.get("deep") || "").toLowerCase());
  try {
    const readiness = deep ? await deepAgentReadiness() : configuredAgentReadiness();
    const meta = marketingConnections().filter((connection) => ["meta", "facebook", "instagram", "meta-capi"].includes(connection.key));
    return NextResponse.json({
      ...(deep ? readiness : {
        suite: "BharatShop Agent Suite v4",
        promptVersion: "agent-suite-v4",
        ...readiness,
        checkedAt: new Date().toISOString(),
      }),
      verificationMode: deep ? "DEEP_LIVE_DEPENDENCY_PROBE" : "CONFIGURATION_PROBE",
      metaIntegration: meta,
      policy: "READY means the agent's required shared dependencies and runtime tool mapping passed. External paid activation, supplier payments, refunds/payouts and credential changes remain human-gated even when the agent is READY.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      suite: "BharatShop Agent Suite v4",
      verificationMode: deep ? "DEEP_LIVE_DEPENDENCY_PROBE" : "CONFIGURATION_PROBE",
      error: error instanceof Error ? error.message : "Agent readiness probe failed",
      summary: { allReady: false },
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
