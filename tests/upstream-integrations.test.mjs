import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../upstreams/bharatshop-upstreams.json", import.meta.url), "utf8"));
const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../src/lib/integrations/upstream-ai.ts", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/app/api/integrations/upstream/route.ts", import.meta.url), "utf8");
const actionRoute = fs.readFileSync(new URL("../src/app/api/integrations/upstream/action/route.ts", import.meta.url), "utf8");
const commandPage = fs.readFileSync(new URL("../src/app/dashboard/command-centre/page.tsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../src/components/UpstreamIntegrationsPanel.tsx", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bootstrap = fs.readFileSync(new URL("../scripts/bootstrap-upstreams.ps1", import.meta.url), "utf8");
const runtimeWrapper = fs.readFileSync(new URL("../scripts/run-upstream-runtime.ps1", import.meta.url), "utf8");
const remotionService = fs.readFileSync(new URL("../services/remotion/server.mjs", import.meta.url), "utf8");
const upgradeSync = fs.readFileSync(new URL("../scripts/sync-agent-upgrade-skills.mjs", import.meta.url), "utf8");

test("requested upstream repositories are pinned exactly once", () => {
  const expected = new Map([
    ["remotion", "https://github.com/remotion-dev/remotion"],
    ["openhands", "https://github.com/OpenHands/OpenHands"],
    ["personalive", "https://github.com/GVCLab/PersonaLive"],
    ["mumu-ai-novel", "https://github.com/xiamuceer-j/MuMuAINovel"],
    ["marketing-skills", "https://github.com/coreyhaines31/marketingskills"],
    ["dify", "https://github.com/langgenius/dify"],
    ["librechat", "https://github.com/danny-avila/LibreChat"],
    ["vercel-ai-sdk", "https://github.com/vercel/ai"],
    ["crawlee-research", "https://github.com/apify/crawlee"],
    ["trigger-dev", "https://github.com/triggerdotdev/trigger.dev"],
    ["langfuse-js", "https://github.com/langfuse/langfuse-js"],
    ["uptime-kuma", "https://github.com/louislam/uptime-kuma"],
    ["agentmemory", "https://github.com/rohitg00/agentmemory"],
    ["openviking", "https://github.com/volcengine/OpenViking"],
    ["browser-use", "https://github.com/browser-use/browser-use"],
    ["awesome-harness-engineering", "https://github.com/ai-boost/awesome-harness-engineering"],
    ["diagram-design", "https://github.com/cathrynlavery/diagram-design"],
    ["scientific-agent-skills", "https://github.com/K-Dense-AI/scientific-agent-skills"],
  ]);
  assert.equal(manifest.upstreams.length, expected.size);
  assert.equal(new Set(manifest.upstreams.map((item) => item.id)).size, expected.size);
  for (const item of manifest.upstreams) {
    assert.equal(item.repository, expected.get(item.id));
    assert.match(item.commit, /^[0-9a-f]{40}$/);
  }
});

test("PersonaLive cannot be enabled without explicit rights approval", () => {
  const persona = manifest.upstreams.find((item) => item.id === "personalive");
  assert.equal(persona.productionDefault, "blocked-pending-rights-clearance");
  assert.match(registry, /PERSONALIVE_COMMERCIAL_USE_APPROVED/);
  assert.match(registry, /blockedByPolicy/);
  assert.match(bootstrap, /BHARATSHOP_PERSONALIVE_ENABLED" "false/);
});

test("Dify remains an isolated single-workspace service with license warning", () => {
  const dify = manifest.upstreams.find((item) => item.id === "dify");
  assert.equal(dify.productionDefault, "disabled-single-workspace-only");
  assert.match(registry, /multi-tenant/i);
  assert.match(registry, /frontend branding/i);
  assert.match(panel, /Single-workspace integration only/);
});

test("upstream credentials remain server-only", () => {
  const sensitiveNames = [
    "REMOTION_SERVICE_TOKEN",
    "OPENHANDS_AGENT_SERVER_TOKEN",
    "PERSONALIVE_SERVICE_TOKEN",
    "MUMU_AI_SERVICE_TOKEN",
    "DIFY_SERVICE_TOKEN",
    "LIBRECHAT_SERVICE_TOKEN",
    "AGENTMEMORY_SECRET",
  ];
  for (const name of sensitiveNames) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
    assert.doesNotMatch(envExample, new RegExp(`^NEXT_PUBLIC_${name}=`, "m"));
  }
});

test("live health verification accepts authenticated admin or automation token", () => {
  assert.match(route, /getAdminUser/);
  assert.match(route, /hasAutomationAccess/);
  assert.match(route, /verificationPerformed: canVerify/);
  assert.match(route, /BHARATSHOP_AUTOMATION_TOKEN/);
  assert.match(route, /verifyRequested/);
});

test("local pinned marketing skills are surfaced as installed", () => {
  assert.match(route, /\.bharatshop-marketingskills\.json/);
  assert.match(route, /localInstalled/);
  assert.match(route, /MARKETING_SKILLS_PIN/);
});

test("selected upgrade skills are pinned, additive and surfaced as installed", () => {
  assert.match(route, /\.bharatshop-agent-upgrades\.json/);
  assert.match(route, /UPGRADE_SKILL_PINS/);
  assert.match(packageJson.scripts["skills:upgrades:sync"], /sync-agent-upgrade-skills\.mjs --apply/);
  assert.match(packageJson.scripts["skills:upgrades:check"], /sync-agent-upgrade-skills\.mjs --check/);
  assert.match(upgradeSync, /skills\/browser-use/);
  assert.match(upgradeSync, /skills\/diagram-design/);
  assert.match(upgradeSync, /skills\/statsmodels/);
  assert.match(upgradeSync, /skills\/scientific-visualization/);
  assert.doesNotMatch(upgradeSync, /fs\.rm\(TARGET\s*,/);
});

test("command centre exposes all eleven runtime capability tracks", () => {
  assert.ok(commandPage.indexOf("<UpstreamIntegrationsPanel") < commandPage.indexOf("<CommandCentreV3"));
  for (const id of [
    "remotion",
    "openhands",
    "personalive",
    "mumu-ai-novel",
    "marketing-skills",
    "dify",
    "librechat",
    "agentmemory",
    "browser-use",
    "diagram-design",
    "scientific-agent-skills",
  ]) {
    assert.match(panel, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /\/api\/integrations\/upstream\?verify=1/);
  assert.match(panel, /Render test MP4/);
  assert.match(panel, /Open Agent Canvas/);
  assert.match(panel, /Open Creative Studio/);
  assert.match(panel, /Open Dify Studio/);
  assert.match(panel, /Open LibreChat/);
  assert.match(panel, /skills:upgrades:sync/);
});

test("AgentMemory is isolated and OpenViking stays out of the BharatShop runtime", () => {
  assert.match(registry, /id: "agentmemory"/);
  assert.match(registry, /\/agentmemory\/health/);
  assert.match(registry, /AGENTMEMORY_URL/);
  assert.match(registry, /must not replace BharatShop PostgreSQL/);
  assert.doesNotMatch(registry, /id: "openviking"/);
  assert.match(route, /OpenViking remains excluded from runtime integration pending AGPL architecture review/);
});

test("automated local runtime covers the safe service set", () => {
  assert.match(packageJson.scripts["dev:full"], /run-upstream-runtime\.ps1/);
  assert.match(packageJson.scripts["upstreams:bootstrap"], /run-upstream-runtime\.ps1/);
  assert.match(packageJson.scripts["upstreams:dify"], /-Mode Dify/);
  assert.match(packageJson.scripts["upstreams:librechat"], /-Mode LibreChat/);
  assert.match(runtimeWrapper, /Docker\\Docker\\resources\\bin\\docker\.exe/);
  assert.match(runtimeWrapper, /Docker Desktop\.exe/);
  assert.match(runtimeWrapper, /Ensure-DockerDesktopReady/);
  assert.match(runtimeWrapper, /bootstrap-upstreams\.ps1/);
  assert.match(bootstrap, /ghcr\.io\/openhands\/agent-canvas:1\.18\.0/);
  assert.match(bootstrap, /\/projects\/bharatshop/);
  assert.match(bootstrap, new RegExp(manifest.upstreams.find((item) => item.id === "mumu-ai-novel").commit));
  assert.match(bootstrap, new RegExp(manifest.upstreams.find((item) => item.id === "dify").commit));
  assert.match(bootstrap, new RegExp(manifest.upstreams.find((item) => item.id === "librechat").commit));
  assert.match(bootstrap, /DifyPort = 8204/);
  assert.match(bootstrap, /LibreChatPort = 8205/);
  assert.match(bootstrap, /host\.docker\.internal:11434\/v1/);
  assert.match(bootstrap, /version: 1\.3\.16/);
  assert.match(remotionService, /\/render/);
  assert.match(remotionService, /4\.0\.524/);
});

test("upstream actions require admin authentication and keep PersonaLive blocked", () => {
  assert.match(actionRoute, /getAdminUser/);
  assert.match(actionRoute, /Admin authentication required/);
  assert.match(actionRoute, /render-product-ad/);
  assert.match(actionRoute, /blocked by policy|rights approval/i);
});
