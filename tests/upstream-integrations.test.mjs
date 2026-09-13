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
const remotionService = fs.readFileSync(new URL("../services/remotion/server.mjs", import.meta.url), "utf8");

test("requested upstream repositories are pinned exactly once", () => {
  const expected = new Map([
    ["remotion", "https://github.com/remotion-dev/remotion"],
    ["openhands", "https://github.com/OpenHands/OpenHands"],
    ["personalive", "https://github.com/GVCLab/PersonaLive"],
    ["mumu-ai-novel", "https://github.com/xiamuceer-j/MuMuAINovel"],
    ["marketing-skills", "https://github.com/coreyhaines31/marketingskills"],
    ["dify", "https://github.com/langgenius/dify"],
    ["librechat", "https://github.com/danny-avila/LibreChat"],
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

test("command centre exposes all seven upstream capability tracks", () => {
  assert.ok(commandPage.indexOf("<UpstreamIntegrationsPanel") < commandPage.indexOf("<CommandCentreV3"));
  for (const id of ["remotion", "openhands", "personalive", "mumu-ai-novel", "marketing-skills", "dify", "librechat"]) {
    assert.match(panel, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /\/api\/integrations\/upstream\?verify=1/);
  assert.match(panel, /Render test MP4/);
  assert.match(panel, /Open Agent Canvas/);
  assert.match(panel, /Open Creative Studio/);
  assert.match(panel, /Open Dify Studio/);
  assert.match(panel, /Open LibreChat/);
});

test("automated local runtime covers the safe service set", () => {
  assert.match(packageJson.scripts["dev:full"], /bootstrap-upstreams\.ps1/);
  assert.match(packageJson.scripts["upstreams:bootstrap"], /bootstrap-upstreams\.ps1/);
  assert.match(packageJson.scripts["upstreams:dify"], /-Mode Dify/);
  assert.match(packageJson.scripts["upstreams:librechat"], /-Mode LibreChat/);
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
