import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../upstreams/bharatshop-upstreams.json", import.meta.url), "utf8"));
const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../src/lib/integrations/upstream-ai.ts", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/app/api/integrations/upstream/route.ts", import.meta.url), "utf8");
const commandPage = fs.readFileSync(new URL("../src/app/dashboard/command-centre/page.tsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../src/components/UpstreamIntegrationsPanel.tsx", import.meta.url), "utf8");

test("requested upstream repositories are pinned exactly once", () => {
  const expected = new Map([
    ["remotion", "https://github.com/remotion-dev/remotion"],
    ["openhands", "https://github.com/OpenHands/OpenHands"],
    ["personalive", "https://github.com/GVCLab/PersonaLive"],
    ["mumu-ai-novel", "https://github.com/xiamuceer-j/MuMuAINovel"],
    ["marketing-skills", "https://github.com/coreyhaines31/marketingskills"],
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
});

test("upstream credentials remain server-only", () => {
  const sensitiveNames = [
    "REMOTION_SERVICE_TOKEN",
    "OPENHANDS_AGENT_SERVER_TOKEN",
    "PERSONALIVE_SERVICE_TOKEN",
    "MUMU_AI_SERVICE_TOKEN",
  ];
  for (const name of sensitiveNames) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
    assert.doesNotMatch(envExample, new RegExp(`^NEXT_PUBLIC_${name}=`, "m"));
  }
});

test("health verification requires the existing automation token", () => {
  assert.match(route, /hasAutomationAccess/);
  assert.match(route, /verificationPerformed: canVerify/);
  assert.match(route, /BHARATSHOP_AUTOMATION_TOKEN/);
});

test("local pinned marketing skills are surfaced as installed", () => {
  assert.match(route, /\.bharatshop-marketingskills\.json/);
  assert.match(route, /localInstalled/);
  assert.match(route, /MARKETING_SKILLS_PIN/);
});

test("command centre exposes all upstream capability tracks", () => {
  assert.match(commandPage, /UpstreamIntegrationsPanel/);
  for (const id of ["remotion", "openhands", "personalive", "mumu-ai-novel", "marketing-skills"]) {
    assert.match(panel, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /\/api\/integrations\/upstream/);
  assert.match(panel, /PERSONALIVE_COMMERCIAL_USE_APPROVED/);
});
