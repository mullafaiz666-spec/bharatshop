import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getUpstreamIntegrationStatus, probeUpstreamIntegrations } from "@/lib/integrations/upstream-ai";

export const dynamic = "force-dynamic";

const MARKETING_SKILLS_PIN = "5b2c0007766c6a1cf1d53fd8fc73e979e0821022";

function hasAutomationAccess(req: Request) {
  const expected = String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
  if (!expected) return false;
  const header = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const alternate = String(req.headers.get("x-automation-token") || "").trim();
  return header === expected || alternate === expected;
}

function localMarketingSkills() {
  const markerPath = path.join(process.cwd(), ".agents", "skills", ".bharatshop-marketingskills.json");
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    const installed = marker?.repository === "coreyhaines31/marketingskills"
      && marker?.commit === MARKETING_SKILLS_PIN
      && Number(marker?.files || 0) > 0;
    return { installed, files: installed ? Number(marker.files) : 0 };
  } catch {
    return { installed: false, files: 0 };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const verifyRequested = url.searchParams.get("verify") === "1";
  const admin = verifyRequested ? await getAdminUser().catch(() => null) : null;
  const canVerify = verifyRequested && (Boolean(admin) || hasAutomationAccess(req));
  const baseIntegrations = canVerify
    ? await probeUpstreamIntegrations()
    : getUpstreamIntegrationStatus();

  const marketingSkills = localMarketingSkills();
  const integrations = baseIntegrations.map((item) => {
    if (item.id !== "marketing-skills") return item;
    if (!marketingSkills.installed) return { ...item, localInstalled: false, localFiles: 0 };
    return {
      ...item,
      requested: true,
      configured: true,
      enabled: true,
      localInstalled: true,
      localFiles: marketingSkills.files,
      ...("health" in item ? { health: "READY" as const } : {}),
    };
  });

  const enabled = integrations.filter((item) => item.enabled).length;
  const configured = integrations.filter((item) => item.configured).length;
  const blocked = integrations.filter((item) => item.blockedByPolicy).map((item) => item.id);
  const errors = integrations.filter((item) => String("health" in item ? item.health || "" : "").toUpperCase() === "ERROR").map((item) => item.id);

  return NextResponse.json({
    status: errors.length ? "PARTIAL" : "READY",
    mode: "automated-local-upstream-runtime",
    verificationPerformed: canVerify,
    anyConfigured: configured > 0,
    anyConnected: integrations.some((item) => String("health" in item ? item.health || "" : "").toUpperCase() === "READY" || item.enabled),
    integrations,
    summary: {
      total: integrations.length,
      configured,
      enabled,
      blocked,
      errors,
    },
    bootstrap: {
      command: "npm run upstreams:bootstrap",
      fullWorkstationCommand: "npm run dev:full",
      statusCommand: "npm run upstreams:status",
      stopCommand: "npm run upstreams:stop",
    },
    policy: "Remotion runs as an isolated local render service. OpenHands and MuMuAINovel run in Docker isolation when Docker Desktop is available. Marketing Skills stay pinned locally. PersonaLive remains hard-blocked until commercial/model rights are explicitly approved.",
  });
}
