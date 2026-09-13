import { NextResponse } from "next/server";
import { getUpstreamIntegrationStatus, probeUpstreamIntegrations } from "@/lib/integrations/upstream-ai";

export const dynamic = "force-dynamic";

function hasAutomationAccess(req: Request) {
  const expected = String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
  if (!expected) return false;
  const header = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const alternate = String(req.headers.get("x-automation-token") || "").trim();
  return header === expected || alternate === expected;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const verifyRequested = url.searchParams.get("verify") === "1";
  const canVerify = verifyRequested && hasAutomationAccess(req);
  const integrations = canVerify
    ? await probeUpstreamIntegrations()
    : getUpstreamIntegrationStatus();

  const enabled = integrations.filter((item) => item.enabled).length;
  const configured = integrations.filter((item) => item.configured).length;
  const blocked = integrations.filter((item) => item.blockedByPolicy).map((item) => item.id);
  const errors = integrations.filter((item) => "health" in item && item.health === "ERROR").map((item) => item.id);

  return NextResponse.json({
    status: errors.length ? "PARTIAL" : "READY",
    mode: "feature-gated-upstream-adapters",
    verificationPerformed: canVerify,
    anyConfigured: configured > 0,
    anyConnected: integrations.some((item) => "health" in item ? item.health === "READY" : item.enabled),
    integrations,
    summary: {
      total: integrations.length,
      configured,
      enabled,
      blocked,
      errors,
    },
    policy: "Upstream repositories remain isolated behind service or Agent Skills boundaries. No integration can modify production data merely by being configured. PersonaLive is hard-blocked until commercial/model rights are explicitly approved.",
  });
}
