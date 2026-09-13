import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getUpstreamIntegrationStatus, probeUpstreamIntegrations, type UpstreamIntegrationId } from "@/lib/integrations/upstream-ai";

export const dynamic = "force-dynamic";

const MARKETING_SKILLS_PIN = "5b2c0007766c6a1cf1d53fd8fc73e979e0821022";
const UPGRADE_SKILL_PINS: Partial<Record<UpstreamIntegrationId, { repository: string; commit: string }>> = {
  "browser-use": {
    repository: "browser-use/browser-use",
    commit: "6e1977daa0f67c9de0bc0e16aaec8b5833eeb8e0",
  },
  "diagram-design": {
    repository: "cathrynlavery/diagram-design",
    commit: "8d8b2993ee2256ee7dfc0eeb3b5713aba3b60792",
  },
  "scientific-agent-skills": {
    repository: "K-Dense-AI/scientific-agent-skills",
    commit: "0b2afe68a5f9379097ad815e028af664f1e222b7",
  },
};

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

function localUpgradeSkills() {
  const markerPath = path.join(process.cwd(), ".agents", "skills", ".bharatshop-agent-upgrades.json");
  const result = new Map<UpstreamIntegrationId, { installed: boolean; files: number }>();
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    const sources = Array.isArray(marker?.sources) ? marker.sources : [];
    for (const [id, pin] of Object.entries(UPGRADE_SKILL_PINS) as Array<[UpstreamIntegrationId, { repository: string; commit: string }]>) {
      const match = sources.find((item: { id?: string; repository?: string; commit?: string; files?: number }) => item?.id === id);
      const installed = match?.repository === pin.repository && match?.commit === pin.commit && Number(match?.files || 0) > 0;
      result.set(id, { installed, files: installed ? Number(match.files) : 0 });
    }
  } catch {
    for (const id of Object.keys(UPGRADE_SKILL_PINS) as UpstreamIntegrationId[]) {
      result.set(id, { installed: false, files: 0 });
    }
  }
  return result;
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
  const upgradeSkills = localUpgradeSkills();
  const integrations = baseIntegrations.map((item) => {
    if (item.id === "marketing-skills" && marketingSkills.installed) {
      return {
        ...item,
        requested: true,
        configured: true,
        enabled: true,
        localInstalled: true,
        localFiles: marketingSkills.files,
        ...("health" in item ? { health: "READY" as const } : {}),
      };
    }

    if (item.id === "marketing-skills") return { ...item, localInstalled: false, localFiles: 0 };

    const local = upgradeSkills.get(item.id);
    if (!local?.installed) return local ? { ...item, localInstalled: false, localFiles: 0 } : item;
    return {
      ...item,
      requested: true,
      configured: true,
      enabled: true,
      localInstalled: true,
      localFiles: local.files,
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
      skillUpgradeCommand: "npm run skills:upgrades:sync",
    },
    policy: "External runtimes stay isolated and disabled by default. AgentMemory is a private memory sidecar only. Browser Use, Diagram Design, and selected scientific skills are workstation Agent Skills, never storefront dependencies. OpenViking remains excluded from runtime integration pending AGPL architecture review.",
  });
}
